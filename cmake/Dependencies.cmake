include(FetchContent)

FetchContent_Declare(Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.8.1
)

set(JPH_BUILD_SAMPLES OFF CACHE BOOL "" FORCE)
set(JPH_BUILD_UNIT_TESTS OFF CACHE BOOL "" FORCE)
set(JPH_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(JPH_BUILD_TEST_FRAMEWORK OFF CACHE BOOL "" FORCE)
set(JPH_ENABLE_ASSERTS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(JoltPhysics
  GIT_REPOSITORY https://github.com/jrouwe/JoltPhysics.git
  GIT_TAG v5.5.0
  SOURCE_SUBDIR Build
)

FetchContent_MakeAvailable(Catch2 JoltPhysics)
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
