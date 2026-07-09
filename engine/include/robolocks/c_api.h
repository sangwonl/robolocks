#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void* RobolocksBattleRunnerHandle;
typedef const char* (*RobolocksJsonBotCallback)(uint32_t bot_id, const char* observation_json, void* user_data);
typedef void (*RobolocksJsonBotReleaseCallback)(const char* response_json, void* user_data);

// Returns the message of the most recent C API error on this thread (e.g. a
// failed create_from_json, or a step/run whose JSON bot callback threw).
// Valid until the next failing call on this thread. Never null.
const char* robolocks_last_error(void);

RobolocksBattleRunnerHandle robolocks_battle_runner_create_from_json(const char* json_config);
void robolocks_battle_runner_destroy(RobolocksBattleRunnerHandle handle);

void robolocks_battle_runner_set_json_bot_callback(
  RobolocksJsonBotCallback callback,
  RobolocksJsonBotReleaseCallback release_callback,
  void* user_data
);

// Advances the simulation by one tick. If a bound JSON bot callback throws
// (e.g. it is unregistered, returns null, or returns malformed orders JSON),
// the step fails softly: the runner's observable state (tick, snapshot) is
// left unchanged, robolocks_last_error() is set, and frame_json() returns
// null until the next step/run call succeeds. No exception ever crosses this
// boundary.
void robolocks_battle_runner_step(RobolocksBattleRunnerHandle handle);

// Advances the simulation by tick_count ticks. On a mid-run callback failure,
// ticks already completed are kept (the snapshot reflects them), the failure
// is recorded via robolocks_last_error(), and frame_json() returns null until
// the next step/run call succeeds. No exception ever crosses this boundary.
// tick_count == 0 is a no-op: it returns immediately without touching any
// error state, so a runner already in a failed state stays failed.
void robolocks_battle_runner_run(RobolocksBattleRunnerHandle handle, uint64_t tick_count);

uint64_t robolocks_battle_runner_tick(RobolocksBattleRunnerHandle handle);

// Returns the current tick as a JSON frame (same schema as a replay frame):
// units (with name/teamId/modules/intents), projectiles, events, actions and
// ruleState. The returned string is owned by the runner handle and stays valid
// until the next frame_json/step/run/destroy call. Returns null on error,
// including when the most recent step/run call failed (see
// robolocks_battle_runner_step/run) -- check robolocks_last_error() in that case.
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
