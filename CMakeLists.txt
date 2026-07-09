cmake_minimum_required(VERSION 3.24)
project(robolocks VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
FetchContent_Declare(nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(robolocks_core
  engine/src/version.cpp
  engine/src/math.cpp
    engine/src/combat_resolution.cpp
    engine/src/order_resolution.cpp
    engine/src/intent_state.cpp
    engine/src/actuator_system.cpp
    engine/src/projectile_system.cpp
    engine/src/battle_simulation.cpp
  engine/src/physics_system.cpp
  engine/src/battle_runner.cpp
  engine/src/controller_protocol_json.cpp
  engine/src/snapshot_json.cpp
  engine/src/json_callback_bot_controller.cpp
  engine/src/sensor_system.cpp
  engine/src/c_api.cpp
  engine/src/battle_loader.cpp
)

target_include_directories(robolocks_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/engine/include
)

target_link_libraries(robolocks_core PUBLIC
  nlohmann_json::nlohmann_json
)

target_compile_options(robolocks_core PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -ffp-contract=off>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /fp:strict>
)

if(NOT EMSCRIPTEN)
  include(cmake/Dependencies.cmake)
  enable_testing()

  add_library(robolocks_native_io
    engine/src/controller_factory.cpp
    engine/src/python_bot_controller.cpp
  )

  target_link_libraries(robolocks_native_io PUBLIC
    robolocks_core
  )

  target_link_libraries(robolocks_core PUBLIC
    Jolt
  )
  target_compile_definitions(robolocks_core PUBLIC ROBOLOCKS_USE_JOLT=1)
  target_compile_definitions(robolocks_native_io PRIVATE
    ROBOLOCKS_PYTHON_SDK_DIR="${CMAKE_CURRENT_SOURCE_DIR}/sdk/python"
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
    engine/tests/order_resolution_test.cpp
    engine/tests/intent_state_test.cpp
    engine/tests/actuator_system_test.cpp
    engine/tests/projectile_system_test.cpp
    engine/tests/battle_simulation_test.cpp
    engine/tests/physics_system_test.cpp
    engine/tests/battle_runner_test.cpp
    engine/tests/json_callback_bot_controller_test.cpp
    engine/tests/c_api_test.cpp
    engine/tests/battle_loader_test.cpp
    engine/tests/controller_protocol_json_test.cpp
    engine/tests/snapshot_json_test.cpp
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
    NAME "cli runs preset duel through battle runner"
    COMMAND robolocks_cli run --battle ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/matches/preset_duel_v0.json --ticks 3
  )
  add_test(
    NAME "cli runs fixture battle through battle runner"
    COMMAND robolocks_cli run --battle ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/matches/preset_duel_v0.json --ticks 3
  )
  add_test(
    NAME "cli runs python fixture battle through battle runner"
    COMMAND robolocks_cli run --battle ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/matches/preset_duel_python_v0.json --ticks 3
  )
  add_test(
    NAME "cli streams preset duel frames as JSONL"
    COMMAND ${CMAKE_COMMAND}
      -DROBOLOCKS_CLI=$<TARGET_FILE:robolocks_cli>
      -DROBOLOCKS_SOURCE_DIR=${CMAKE_CURRENT_SOURCE_DIR}
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

  find_package(Python3 COMPONENTS Interpreter)
  if(Python3_FOUND)
    add_test(
      NAME "python sdk runtime unit tests"
      COMMAND ${Python3_EXECUTABLE} -m unittest discover -s ${CMAKE_SOURCE_DIR}/sdk/python/tests
      WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}/sdk/python
    )
  endif()
endif()

if(EMSCRIPTEN)
  set(ROBOLOCKS_WASM_EXPORTED_FUNCTIONS
    _malloc
    _free
    _robolocks_engine_version
    _robolocks_last_error
    _robolocks_battle_runner_create_from_json
    _robolocks_battle_runner_set_json_bot_callback
    _robolocks_battle_runner_destroy
    _robolocks_battle_runner_step
    _robolocks_battle_runner_run
    _robolocks_battle_runner_tick
    _robolocks_battle_runner_frame_json
    _robolocks_battle_runner_obstacle_count
    _robolocks_battle_runner_obstacle_id
    _robolocks_battle_runner_obstacle_x
    _robolocks_battle_runner_obstacle_y
    _robolocks_battle_runner_obstacle_radius
    _robolocks_battle_runner_obstacle_blocks_movement
    _robolocks_battle_runner_obstacle_blocks_line_of_sight
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
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','addFunction','removeFunction','UTF8ToString','stringToUTF8','lengthBytesUTF8']"
    "SHELL:-sALLOW_TABLE_GROWTH=1"
  )
endif()
