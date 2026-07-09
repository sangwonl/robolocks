#include <robolocks/battle_loader.hpp>
#include <robolocks/battle_runner.hpp>
#include <robolocks/controller_factory.hpp>
#include <robolocks/snapshot.hpp>
#include <robolocks/snapshot_json.hpp>

#include <charconv>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

namespace {

struct CliOptions {
  std::optional<std::string> battle_path;
  std::optional<std::string> replay_out_path;
  robolocks::Tick ticks = 120;
  double tick_rate = 30.0;
  bool stream_json = false;
};

void print_usage(std::ostream& out) {
  out << "usage: robolocks run --battle path [--ticks N] [--stream-json] [--replay-out path]\n";
}

bool parse_tick_count(std::string_view text, robolocks::Tick& out) {
  const auto* begin = text.data();
  const auto* end = begin + text.size();
  std::uint64_t parsed = 0;
  const auto result = std::from_chars(begin, end, parsed);
  if (result.ec != std::errc{} || result.ptr != end) {
    return false;
  }
  out = parsed;
  return true;
}

bool parse_options(int argc, char** argv, CliOptions& options) {
  if (argc < 2 || std::string_view(argv[1]) != "run") {
    return false;
  }

  for (int i = 2; i < argc; i += 1) {
    const std::string_view arg(argv[i]);
    if (arg == "--battle" && i + 1 < argc) {
      options.battle_path = argv[++i];
      continue;
    }
    if (arg == "--ticks" && i + 1 < argc) {
      if (!parse_tick_count(argv[++i], options.ticks)) {
        return false;
      }
      continue;
    }
    if (arg == "--stream-json") {
      options.stream_json = true;
      continue;
    }
    if (arg == "--replay-out" && i + 1 < argc) {
      options.replay_out_path = argv[++i];
      continue;
    }
    return false;
  }

  return options.battle_path.has_value();
}

void print_stream_frame(std::string_view type, const robolocks::WorldSnapshot& snapshot, std::ostream& out) {
  const nlohmann::ordered_json message{
    {"type", type},
    {"frame", robolocks::snapshot_to_json(snapshot)},
  };
  out << message.dump() << "\n";
}

void print_snapshot_stream(robolocks::BattleRunner& runtime, robolocks::Tick ticks, std::ostream& out) {
  if (ticks == 0) {
    print_stream_frame("battleComplete", runtime.snapshot(), out);
    return;
  }

  print_stream_frame("battleFrame", runtime.snapshot(), out);
  for (robolocks::Tick tick = 0; tick < ticks; tick += 1) {
    const auto result = runtime.step_once();
    // The battle ends when the rule decides it (or the engine settles on score at
    // the tick-limit deadline), not merely when the tick budget runs out.
    const bool complete = result.rule_state.outcome.finished || result.snapshot.tick == ticks;
    print_stream_frame(complete ? "battleComplete" : "battleFrame", result.snapshot, out);
    if (result.rule_state.outcome.finished) {
      break;
    }
  }
}

void write_replay_json(
  robolocks::BattleRunner& runtime,
  robolocks::Tick ticks,
  double tick_rate,
  const std::vector<robolocks::StaticObstacle>& obstacles,
  const std::string& path
) {
  std::ofstream out(path);
  if (!out) {
    throw std::runtime_error("Failed to open replay output: " + path);
  }

  auto obstacles_json = nlohmann::ordered_json::array();
  for (const auto& obstacle : obstacles) {
    obstacles_json.push_back(robolocks::obstacle_to_json(obstacle));
  }

  auto frames = nlohmann::ordered_json::array();
  frames.push_back(robolocks::frame_to_json(runtime.snapshot()));
  for (robolocks::Tick tick = 0; tick < ticks; tick += 1) {
    const auto result = runtime.step_once();
    frames.push_back(robolocks::frame_to_json(
      result.snapshot,
      result.events,
      result.orders_by_unit,
      &result.rule_state
    ));
    // Stop recording once the battle is decided by the rule (or settled on score
    // at the tick-limit deadline) rather than always running the full budget.
    if (result.rule_state.outcome.finished) {
      break;
    }
  }

  const nlohmann::ordered_json replay{
    {"type", "robolocks.replay.v1"},
    {"tickRate", tick_rate},
    {"obstacles", std::move(obstacles_json)},
    {"frames", std::move(frames)},
  };
  out << replay.dump() << "\n";
}

}  // namespace

int main(int argc, char** argv) {
  CliOptions options;
  if (!parse_options(argc, argv, options)) {
    print_usage(std::cerr);
    return 2;
  }

  std::vector<robolocks::StaticObstacle> replay_obstacles;
  auto runtime = [&options, &replay_obstacles]() {
    auto loaded = robolocks::load_battle_from_file(*options.battle_path);
    options.tick_rate = 1.0 / loaded.config.tick_dt_sec;
    replay_obstacles = loaded.config.obstacles;
    return robolocks::BattleRunner(
      std::move(loaded.config),
      robolocks::create_controllers(loaded.controllers)
    );
  }();
  try {
    if (options.replay_out_path.has_value()) {
      write_replay_json(runtime, options.ticks, options.tick_rate, replay_obstacles, *options.replay_out_path);
    } else if (options.stream_json) {
      print_snapshot_stream(runtime, options.ticks, std::cout);
    } else {
      const auto snapshot = runtime.run_ticks(options.ticks);
      std::cout << robolocks::frame_to_json(snapshot).dump() << "\n";
    }
  } catch (const std::exception& error) {
    std::cerr << error.what() << "\n";
    return 1;
  }
  return 0;
}
