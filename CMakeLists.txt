cmake_minimum_required(VERSION 3.24)
project(robolocks VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(robolocks_core
  engine/src/version.cpp
  engine/src/math.cpp
  engine/src/battlefield.cpp
  engine/src/physics_system.cpp
  engine/src/battle_runtime.cpp
  engine/src/builtin_controllers.cpp
  engine/src/presets.cpp
  engine/src/sensor_system.cpp
  engine/src/c_api.cpp
)

target_include_directories(robolocks_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/engine/include
)

target_compile_options(robolocks_core PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -ffp-contract=off>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /fp:strict>
)

if(NOT EMSCRIPTEN)
  include(cmake/Dependencies.cmake)
  enable_testing()

  add_library(robolocks_native_io
    engine/src/battle_loader.cpp
    engine/src/controller_factory.cpp
    engine/src/controller_protocol_json.cpp
    engine/src/python_bot_controller.cpp
  )

  target_link_libraries(robolocks_native_io PUBLIC
    robolocks_core
    nlohmann_json::nlohmann_json
  )

  add_executable(robolocks_cli
    engine/cli/main.cpp
  )

  target_link_libraries(robolocks_cli PRIVATE
    robolocks_native_io
  )

  add_executable(robolocks_tests
    engine/tests/version_test.cpp
    engine/tests/math_test.cpp
    engine/tests/order_test.cpp
    engine/tests/battlefield_test.cpp
    engine/tests/physics_system_test.cpp
    engine/tests/battle_runtime_test.cpp
    engine/tests/c_api_test.cpp
    engine/tests/battle_loader_test.cpp
    engine/tests/controller_protocol_json_test.cpp
    engine/tests/python_bot_controller_test.cpp
    engine/tests/sensor_system_test.cpp
  )

  target_link_libraries(robolocks_tests PRIVATE
    robolocks_native_io
    Catch2::Catch2WithMain
  )
  target_compile_definitions(robolocks_tests PRIVATE
    ROBOLOCKS_SOURCE_DIR="${CMAKE_CURRENT_SOURCE_DIR}"
  )

  include(CTest)
  include(Catch)
  catch_discover_tests(robolocks_tests)

  add_test(
    NAME "cli runs preset duel through battle runtime"
    COMMAND robolocks_cli run --preset preset_duel_v0 --ticks 3
  )
  add_test(
    NAME "cli runs fixture battle through battle runtime"
    COMMAND robolocks_cli run --battle ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/matches/preset_duel_v0.json --ticks 3
  )
  add_test(
    NAME "cli runs python fixture battle through battle runtime"
    COMMAND robolocks_cli run --battle ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/matches/preset_duel_python_v0.json --ticks 3
  )
  add_test(
    NAME "cli streams preset duel frames as JSONL"
    COMMAND ${CMAKE_COMMAND}
      -DROBOLOCKS_CLI=$<TARGET_FILE:robolocks_cli>
      -P ${CMAKE_CURRENT_SOURCE_DIR}/engine/tests/cli_stream_test.cmake
  )
  add_test(
    NAME "cli records python fixture replay as JSON"
    COMMAND ${CMAKE_COMMAND}
      -DROBOLOCKS_CLI=$<TARGET_FILE:robolocks_cli>
      -DROBOLOCKS_SOURCE_DIR=${CMAKE_CURRENT_SOURCE_DIR}
      -DREPLAY_DIR=${CMAKE_CURRENT_BINARY_DIR}/replays
      -P ${CMAKE_CURRENT_SOURCE_DIR}/engine/tests/cli_replay_test.cmake
  )
endif()

if(EMSCRIPTEN)
  set(ROBOLOCKS_WASM_EXPORTED_FUNCTIONS
    _robolocks_engine_version
    _robolocks_battle_runtime_create_preset_duel
    _robolocks_battle_runtime_destroy
    _robolocks_battle_runtime_step
    _robolocks_battle_runtime_run_ticks
    _robolocks_battle_runtime_tick
    _robolocks_battle_runtime_unit_count
    _robolocks_battle_runtime_unit_id
    _robolocks_battle_runtime_unit_x
    _robolocks_battle_runtime_unit_y
    _robolocks_battle_runtime_unit_hull_heading_deg
    _robolocks_battle_runtime_unit_turret_heading_deg
    _robolocks_battle_runtime_unit_armor
    _robolocks_battle_runtime_unit_weapon_cooldown_ticks
    _robolocks_battle_runtime_unit_body_shape_type
    _robolocks_battle_runtime_unit_body_radius_m
    _robolocks_battle_runtime_unit_body_length_m
    _robolocks_battle_runtime_unit_body_width_m
    _robolocks_battle_runtime_unit_mobility_intent_active
    _robolocks_battle_runtime_unit_mobility_intent_target_x
    _robolocks_battle_runtime_unit_mobility_intent_target_y
    _robolocks_battle_runtime_unit_mobility_intent_remaining_m
    _robolocks_battle_runtime_unit_mobility_intent_age_ticks
    _robolocks_battle_runtime_unit_turret_intent_active
    _robolocks_battle_runtime_unit_turret_intent_target_x
    _robolocks_battle_runtime_unit_turret_intent_target_y
    _robolocks_battle_runtime_unit_turret_intent_error_deg
    _robolocks_battle_runtime_unit_turret_intent_age_ticks
    _robolocks_battle_runtime_unit_hull_intent_active
    _robolocks_battle_runtime_unit_hull_intent_target_x
    _robolocks_battle_runtime_unit_hull_intent_target_y
    _robolocks_battle_runtime_unit_hull_intent_error_deg
    _robolocks_battle_runtime_unit_hull_intent_age_ticks
    _robolocks_battle_runtime_unit_weapon_intent_active
    _robolocks_battle_runtime_unit_weapon_intent_min_hit_chance
    _robolocks_battle_runtime_unit_weapon_intent_age_ticks
    _robolocks_battle_runtime_obstacle_count
    _robolocks_battle_runtime_obstacle_id
    _robolocks_battle_runtime_obstacle_x
    _robolocks_battle_runtime_obstacle_y
    _robolocks_battle_runtime_obstacle_radius_m
    _robolocks_battle_runtime_obstacle_blocks_movement
    _robolocks_battle_runtime_obstacle_blocks_line_of_sight
    _robolocks_battle_runtime_event_count
    _robolocks_battle_runtime_event_tick
    _robolocks_battle_runtime_event_unit_id
    _robolocks_battle_runtime_event_code
    _robolocks_battle_runtime_event_message
    _robolocks_battle_runtime_projectile_count
    _robolocks_battle_runtime_projectile_id
    _robolocks_battle_runtime_projectile_owner_unit_id
    _robolocks_battle_runtime_projectile_previous_x
    _robolocks_battle_runtime_projectile_previous_y
    _robolocks_battle_runtime_projectile_x
    _robolocks_battle_runtime_projectile_y
    _robolocks_battle_runtime_projectile_radius_m
    _robolocks_battle_runtime_action_count
    _robolocks_battle_runtime_action_unit_id
    _robolocks_battle_runtime_action_type
    _robolocks_battle_runtime_action_channel
    _robolocks_battle_runtime_action_has_position
    _robolocks_battle_runtime_action_position_x
    _robolocks_battle_runtime_action_position_y
    _robolocks_battle_runtime_action_has_target
    _robolocks_battle_runtime_action_target_x
    _robolocks_battle_runtime_action_target_y
    _robolocks_battle_runtime_action_has_min_hit_chance
    _robolocks_battle_runtime_action_min_hit_chance
    _robolocks_battle_runtime_action_has_scan_arc
    _robolocks_battle_runtime_action_center_deg
    _robolocks_battle_runtime_action_width_deg
  )
  list(JOIN ROBOLOCKS_WASM_EXPORTED_FUNCTIONS "','" ROBOLOCKS_WASM_EXPORTED_FUNCTIONS_JOINED)

  add_executable(robolocks_wasm
    engine/wasm/wasm_exports.cpp
  )

  target_link_libraries(robolocks_wasm PRIVATE robolocks_core)
  target_include_directories(robolocks_wasm PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/engine/include)
  set_target_properties(robolocks_wasm PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/wasm"
  )

  target_link_options(robolocks_wasm PRIVATE
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_NAME=createRobolocksKernel"
    "SHELL:-sEXPORT_ES6=1"
    "SHELL:-sENVIRONMENT=worker"
    "SHELL:-sEXPORTED_FUNCTIONS=['${ROBOLOCKS_WASM_EXPORTED_FUNCTIONS_JOINED}']"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  )
endif()
