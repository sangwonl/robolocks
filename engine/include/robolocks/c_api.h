#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void* RobolocksBattleRunnerHandle;
typedef const char* (*RobolocksJsonBotCallback)(uint32_t bot_id, const char* observation_json, void* user_data);
typedef void (*RobolocksJsonBotReleaseCallback)(const char* response_json, void* user_data);

// Returns the message of the most recent C API error (e.g. a failed
// create_from_json). Valid until the next failing call. Never null.
const char* robolocks_last_error(void);

RobolocksBattleRunnerHandle robolocks_battle_runner_create_from_json(const char* json_config);
void robolocks_battle_runner_destroy(RobolocksBattleRunnerHandle handle);

void robolocks_battle_runner_set_json_bot_callback(
  RobolocksJsonBotCallback callback,
  RobolocksJsonBotReleaseCallback release_callback,
  void* user_data
);

void robolocks_battle_runner_step(RobolocksBattleRunnerHandle handle);
void robolocks_battle_runner_run(RobolocksBattleRunnerHandle handle, uint64_t tick_count);

uint64_t robolocks_battle_runner_tick(RobolocksBattleRunnerHandle handle);

// Returns the current tick as a JSON frame (same schema as a replay frame):
// units (with name/teamId/modules/intents), projectiles, events, actions and
// ruleState. The returned string is owned by the runner handle and stays valid
// until the next frame_json/step/run/destroy call. Returns null on error.
const char* robolocks_battle_runner_frame_json(RobolocksBattleRunnerHandle handle);

size_t robolocks_battle_runner_obstacle_count(RobolocksBattleRunnerHandle handle);
const char* robolocks_battle_runner_obstacle_id(RobolocksBattleRunnerHandle handle, size_t obstacle_index);
double robolocks_battle_runner_obstacle_x(RobolocksBattleRunnerHandle handle, size_t obstacle_index);
double robolocks_battle_runner_obstacle_y(RobolocksBattleRunnerHandle handle, size_t obstacle_index);
double robolocks_battle_runner_obstacle_radius(RobolocksBattleRunnerHandle handle, size_t obstacle_index);
int robolocks_battle_runner_obstacle_blocks_movement(RobolocksBattleRunnerHandle handle, size_t obstacle_index);
int robolocks_battle_runner_obstacle_blocks_line_of_sight(RobolocksBattleRunnerHandle handle, size_t obstacle_index);

#ifdef __cplusplus
}
#endif
