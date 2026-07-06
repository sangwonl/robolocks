cmake_minimum_required(VERSION 3.24)
project(robolocks VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(cmake/Dependencies.cmake)

add_library(robolocks_core
  engine/src/version.cpp
  engine/src/math.cpp
  engine/src/match.cpp
)

target_include_directories(robolocks_core
  PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/engine/include
)

target_compile_options(robolocks_core PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -ffp-contract=off>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /fp:strict>
)

enable_testing()

add_executable(robolocks_tests
  engine/tests/version_test.cpp
  engine/tests/math_test.cpp
  engine/tests/command_test.cpp
  engine/tests/match_test.cpp
)

target_link_libraries(robolocks_tests PRIVATE
  robolocks_core
  Catch2::Catch2WithMain
)

include(CTest)
include(Catch)
catch_discover_tests(robolocks_tests)
