#include <robolocks/c_api.h>

#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runner.hpp>
#include <robolocks/controller_protocol_json.hpp>
#include <robolocks/json_callback_bot_controller.hpp>
#include <robolocks/snapshot_json.hpp>

#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

namespace {

RobolocksJsonBotCallback g_json_bot_callback = nullptr;
RobolocksJsonBotReleaseCallback g_json_bot_release_callback = nullptr;
void* g_json_bot_callback_user_data = nullptr;
// thread_local so concurrent callers (e.g. multiple wasm workers sharing this
// translation unit in a multi-threaded host) each see only their own most
// recent error instead of racing on a shared global.
thread_local std::string g_last_error;

struct RobolocksBattleRunner {
  robolocks::BattleRunner runner;
  robolocks::WorldSnapshot snapshot;
  robolocks::StepResult last_result;
  std::string frame_json;
  // Set when the most recent step/run call threw (e.g. the JSON bot callback
  // failed) and cleared by the next *successful* step/run. While set,
  // frame_json() returns null instead of serializing a frame -- see the
  // header doc comments for the full contract.
  bool has_error = false;

  explicit RobolocksBattleRunner(robolocks::BattleRunner battle_runner)
      : runner(std::move(battle_runner)), snapshot(runner.snapshot()) {}
};

RobolocksBattleRunner* as_runner(RobolocksBattleRunnerHandle handle) {
  return static_cast<RobolocksBattleRunner*>(handle);
}

const robolocks::StaticObstacle* obstacle_at(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr || obstacle_index >= runner->runner.obstacles().size()) {
    return nullptr;
  }
  return &runner->runner.obstacles()[obstacle_index];
}

std::string call_registered_json_bot(robolocks::UnitId bot_id, const std::string& observation_json) {
  if (g_json_bot_callback == nullptr) {
    throw std::runtime_error("JSON bot callback is not registered");
  }
  const char* response = g_json_bot_callback(
    bot_id.value,
    observation_json.c_str(),
    g_json_bot_callback_user_data
  );
  if (response == nullptr) {
    throw std::runtime_error("JSON bot callback returned null");
  }
  std::string response_json(response);
  if (g_json_bot_release_callback != nullptr) {
    g_json_bot_release_callback(response, g_json_bot_callback_user_data);
  }
  return response_json;
}

robolocks::BattleRunner runner_from_loaded(robolocks::LoadedBattle& loaded) {
  std::vector<robolocks::ControllerBinding> controllers;
  for (auto& cfg : loaded.controllers) {
    if (cfg.type == "json_callback") {
      controllers.push_back(robolocks::ControllerBinding{
        cfg.unit_id,
        std::make_unique<robolocks::JsonCallbackBotController>(cfg.unit_id, call_registered_json_bot),
      });
    } else {
      throw std::runtime_error("Unsupported controller type: " + cfg.type);
    }
  }
  return robolocks::BattleRunner(std::move(loaded.config), std::move(controllers));
}

}  // namespace

extern "C" {

const char* robolocks_last_error(void) {
  return g_last_error.c_str();
}

RobolocksBattleRunnerHandle robolocks_battle_runner_create_from_json(const char* json_config) {
  try {
    auto loaded = robolocks::load_battle_from_json_string(json_config);
    return new RobolocksBattleRunner(runner_from_loaded(loaded));
  } catch (const std::exception& error) {
    g_last_error = error.what();
    return nullptr;
  } catch (...) {
    g_last_error = "Unknown error creating battle runner";
    return nullptr;
  }
}

void robolocks_battle_runner_set_json_bot_callback(
  RobolocksJsonBotCallback callback,
  RobolocksJsonBotReleaseCallback release_callback,
  void* user_data
) {
  g_json_bot_callback = callback;
  g_json_bot_release_callback = release_callback;
  g_json_bot_callback_user_data = user_data;
}

void robolocks_battle_runner_destroy(RobolocksBattleRunnerHandle handle) {
  delete as_runner(handle);
}

void robolocks_battle_runner_step(RobolocksBattleRunnerHandle handle) {
  auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return;
  }
  try {
    runner->last_result = runner->runner.step_once();
    runner->snapshot = runner->last_result.snapshot;
    runner->has_error = false;
  } catch (const std::exception& error) {
    g_last_error = error.what();
    runner->has_error = true;
  } catch (...) {
    g_last_error = "Unknown error during battle runner step";
    runner->has_error = true;
  }
}

void robolocks_battle_runner_run(RobolocksBattleRunnerHandle handle, uint64_t tick_count) {
  auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return;
  }
  if (tick_count == 0) {
    // Nothing to advance. Returning here (instead of falling through to the
    // success path below) keeps a prior has_error/last_error state intact --
    // otherwise a no-op run() would incorrectly clear a failed runner's error
    // flag and let frame_json() start serializing a stale/mixed snapshot.
    return;
  }
  try {
    for (uint64_t i = 0; i < tick_count; i += 1) {
      runner->last_result = runner->runner.step_once();
    }
    runner->snapshot = runner->runner.snapshot();
    runner->has_error = false;
  } catch (const std::exception& error) {
    g_last_error = error.what();
    runner->has_error = true;
    // Ticks before the failing one already mutated the runner's internal
    // state; resync the cached snapshot with it instead of leaving stale data.
    runner->snapshot = runner->runner.snapshot();
  } catch (...) {
    g_last_error = "Unknown error during battle runner run";
    runner->has_error = true;
    runner->snapshot = runner->runner.snapshot();
  }
}

uint64_t robolocks_battle_runner_tick(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->snapshot.tick;
}

const char* robolocks_battle_runner_frame_json(RobolocksBattleRunnerHandle handle) {
  auto* runner = as_runner(handle);
  if (runner == nullptr || runner->has_error) {
    return nullptr;
  }
  try {
    runner->frame_json = robolocks::frame_to_json(
      runner->snapshot,
      runner->last_result.events,
      runner->last_result.orders_by_unit,
      &runner->last_result.rule_state
    ).dump();
    return runner->frame_json.c_str();
  } catch (const std::exception& error) {
    g_last_error = error.what();
    return nullptr;
  } catch (...) {
    g_last_error = "Unknown error building battle runner frame JSON";
    return nullptr;
  }
}

size_t robolocks_battle_runner_obstacle_count(RobolocksBattleRunnerHandle handle) {
  const auto* runner = as_runner(handle);
  if (runner == nullptr) {
    return 0;
  }
  return runner->runner.obstacles().size();
}

const char* robolocks_battle_runner_obstacle_id(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return "";
  }
  return obstacle->id.c_str();
}

double robolocks_battle_runner_obstacle_x(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.x;
}

double robolocks_battle_runner_obstacle_y(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->position.y;
}

double robolocks_battle_runner_obstacle_radius(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0.0;
  }
  return obstacle->radius_m;
}

int robolocks_battle_runner_obstacle_blocks_movement(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_movement ? 1 : 0;
}

int robolocks_battle_runner_obstacle_blocks_line_of_sight(RobolocksBattleRunnerHandle handle, size_t obstacle_index) {
  const auto* obstacle = obstacle_at(handle, obstacle_index);
  if (obstacle == nullptr) {
    return 0;
  }
  return obstacle->blocks_line_of_sight ? 1 : 0;
}

}
