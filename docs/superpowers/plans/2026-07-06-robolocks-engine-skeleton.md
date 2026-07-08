# Robolocks Engine Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first executable vertical slice: a C++20 deterministic simulation kernel with native tests, WASM export scaffolding, and a minimal web app that runs a no-delay 1v1 tick loop through a worker.

**Architecture:** The simulation kernel is pure C++ and owns deterministic match state, command validation, stepping, snapshots, and replay events. TypeScript owns UI, worker plumbing, and display; it calls a narrow data-in/data-out kernel adapter so later systems can expand without moving simulation logic into the browser UI.

**Tech Stack:** C++20, CMake 3.24+, Catch2, Emscripten for WASM, TypeScript, Vite, Web Workers, JSON fixtures.

## Global Constraints

- The engine kernel is written in C++ and compiled to WASM from the start.
- TypeScript owns user-facing UI, editor, renderer, and worker plumbing.
- Simulation code must not depend on DOM, renderer, editor, or UI code.
- MVP uses fixed ticks, local worker execution only, no command delay, and per-tick bot timeout diagnostics.
- Host `Math` functions are forbidden in simulation code; deterministic math must live in the kernel.
- Module catalog, maps, and balance data live in JSON outside the compiled kernel.
- The first deliverable uses preset tanks before the module builder is implemented.
- Orders are public AI outputs; Intent is internal; ActuatorInput is the final low-level input.
- Different order channels apply simultaneously; duplicate orders for one channel reject that channel and emit a diagnostic event.
- Current workspace is not a git repository; skip commit steps unless a git repository is initialized before execution.

---

## Planned File Structure

- `CMakeLists.txt`: root CMake project, native executable/test targets, optional WASM target wiring.
- `cmake/Dependencies.cmake`: FetchContent declarations for Catch2.
- `engine/include/robolocks/*.hpp`: public kernel headers for IDs, math, match config, orders, state, snapshots, and kernel API.
- `engine/src/*.cpp`: pure C++ implementation.
- `engine/tests/*.cpp`: native Catch2 tests.
- `web/package.json`: web workspace scripts.
- `web/vite.config.ts`: Vite configuration.
- `web/tsconfig.json`: TS config.
- `web/src/main.ts`: app entry.
- `web/src/index.html`: Vite HTML entry if needed by project layout.
- `web/src/sim/simWorker.ts`: simulation worker entry.
- `web/src/sim/kernelAdapter.ts`: TS adapter around the initial JS fallback and later WASM module.
- `web/src/types/protocol.ts`: shared worker message types.
- `web/src/ui/app.ts`: minimal workbench UI rendering.
- `web/src/ui/styles.css`: minimal dense tool styling.
- `fixtures/maps/duel_grid_v0.json`: first deterministic map fixture.
- `fixtures/matches/preset_duel_v0.json`: first preset match fixture.
- `docs/superpowers/specs/2026-07-06-robolocks-mvp-design.md`: source design reference; do not edit unless implementation reveals a spec issue.

---

### Task 1: Native C++ Project Skeleton

**Files:**
- Create: `CMakeLists.txt`
- Create: `cmake/Dependencies.cmake`
- Create: `engine/include/robolocks/version.hpp`
- Create: `engine/src/version.cpp`
- Create: `engine/tests/version_test.cpp`

**Interfaces:**
- Produces: `robolocks::engine_version() -> std::string`
- Produces: CMake targets `robolocks_core` and `robolocks_tests`

- [ ] **Step 1: Write the failing version test**

Create `engine/tests/version_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include <robolocks/version.hpp>

TEST_CASE("engine version is exposed") {
  REQUIRE(robolocks::engine_version() == "0.1.0");
}
```

- [ ] **Step 2: Add root CMake project and dependency file**

Create `CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.24)
project(robolocks VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(cmake/Dependencies.cmake)

add_library(robolocks_core
  engine/src/version.cpp
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
)

target_link_libraries(robolocks_tests PRIVATE
  robolocks_core
  Catch2::Catch2WithMain
)

include(CTest)
include(Catch)
catch_discover_tests(robolocks_tests)
```

Create `cmake/Dependencies.cmake`:

```cmake
include(FetchContent)

FetchContent_Declare(Catch2
  GIT_REPOSITORY https://github.com/catchorg/Catch2.git
  GIT_TAG v3.8.1
)

FetchContent_MakeAvailable(Catch2)
list(APPEND CMAKE_MODULE_PATH ${catch2_SOURCE_DIR}/extras)
```

- [ ] **Step 3: Run test to verify it fails before implementation**

Run: `cmake -S . -B build-native -DCMAKE_BUILD_TYPE=Debug && cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: build fails because `engine/include/robolocks/version.hpp` and `engine/src/version.cpp` do not exist.

- [ ] **Step 4: Implement version API**

Create `engine/include/robolocks/version.hpp`:

```cpp
#pragma once

#include <string>

namespace robolocks {

std::string engine_version();

}  // namespace robolocks
```

Create `engine/src/version.cpp`:

```cpp
#include <robolocks/version.hpp>

namespace robolocks {

std::string engine_version() {
  return "0.1.0";
}

}  // namespace robolocks
```

- [ ] **Step 5: Run native tests**

Run: `cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: all tests pass, including `engine version is exposed`.

- [ ] **Step 6: Commit if repository exists**

If `git rev-parse --is-inside-work-tree` succeeds, run:

```bash
git add CMakeLists.txt cmake/Dependencies.cmake engine/include/robolocks/version.hpp engine/src/version.cpp engine/tests/version_test.cpp
git commit -m "chore: add native engine skeleton"
```

If it fails, skip commit and note that the workspace is not a git repository.

---

### Task 2: Core Types and Deterministic Math

**Files:**
- Create: `engine/include/robolocks/types.hpp`
- Create: `engine/include/robolocks/math.hpp`
- Create: `engine/src/math.cpp`
- Create: `engine/tests/math_test.cpp`
- Modify: `CMakeLists.txt`

**Interfaces:**
- Consumes: `robolocks_core` target from Task 1
- Produces: `robolocks::Vec2`
- Produces: `robolocks::UnitId`, `robolocks::Tick`
- Produces: `robolocks::clamp`, `robolocks::length`, `robolocks::normalize_or_zero`, `robolocks::advance_toward`

- [ ] **Step 1: Write deterministic math tests**

Create `engine/tests/math_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>
#include <robolocks/math.hpp>

TEST_CASE("vector length is deterministic for simple values") {
  const robolocks::Vec2 v{3.0, 4.0};
  REQUIRE(robolocks::length(v) == Catch::Approx(5.0));
}

TEST_CASE("normalize_or_zero handles zero vector") {
  const robolocks::Vec2 v{0.0, 0.0};
  const auto n = robolocks::normalize_or_zero(v);
  REQUIRE(n.x == 0.0);
  REQUIRE(n.y == 0.0);
}

TEST_CASE("advance_toward does not overshoot") {
  const robolocks::Vec2 from{0.0, 0.0};
  const robolocks::Vec2 to{10.0, 0.0};
  const auto moved = robolocks::advance_toward(from, to, 3.0);
  REQUIRE(moved.x == Catch::Approx(3.0));
  REQUIRE(moved.y == Catch::Approx(0.0));

  const auto clamped = robolocks::advance_toward(from, to, 20.0);
  REQUIRE(clamped.x == Catch::Approx(10.0));
  REQUIRE(clamped.y == Catch::Approx(0.0));
}
```

- [ ] **Step 2: Add files to CMake and verify failure**

Modify `CMakeLists.txt`:

```cmake
add_library(robolocks_core
  engine/src/version.cpp
  engine/src/math.cpp
)
```

Modify `robolocks_tests` source list:

```cmake
add_executable(robolocks_tests
  engine/tests/version_test.cpp
  engine/tests/math_test.cpp
)
```

Run: `cmake --build build-native --target robolocks_tests`

Expected: build fails because math headers and implementation do not exist.

- [ ] **Step 3: Implement core types**

Create `engine/include/robolocks/types.hpp`:

```cpp
#pragma once

#include <cstdint>

namespace robolocks {

using Tick = std::uint64_t;

struct UnitId {
  std::uint32_t value = 0;

  friend bool operator==(const UnitId& a, const UnitId& b) {
    return a.value == b.value;
  }
};

struct Vec2 {
  double x = 0.0;
  double y = 0.0;
};

}  // namespace robolocks
```

- [ ] **Step 4: Implement deterministic math helpers**

Create `engine/include/robolocks/math.hpp`:

```cpp
#pragma once

#include <robolocks/types.hpp>

namespace robolocks {

double clamp(double value, double min_value, double max_value);
double length(Vec2 v);
Vec2 normalize_or_zero(Vec2 v);
Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance);

}  // namespace robolocks
```

Create `engine/src/math.cpp`:

```cpp
#include <robolocks/math.hpp>

#include <cmath>

namespace robolocks {

double clamp(double value, double min_value, double max_value) {
  if (value < min_value) {
    return min_value;
  }
  if (value > max_value) {
    return max_value;
  }
  return value;
}

double length(Vec2 v) {
  return std::sqrt(v.x * v.x + v.y * v.y);
}

Vec2 normalize_or_zero(Vec2 v) {
  const double len = length(v);
  if (len <= 0.0) {
    return {};
  }
  return Vec2{v.x / len, v.y / len};
}

Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance) {
  const Vec2 delta{to.x - from.x, to.y - from.y};
  const double distance = length(delta);
  if (distance <= max_distance || distance <= 0.0) {
    return to;
  }
  const Vec2 dir = normalize_or_zero(delta);
  return Vec2{
    from.x + dir.x * max_distance,
    from.y + dir.y * max_distance,
  };
}

}  // namespace robolocks
```

- [ ] **Step 5: Run native tests**

Run: `cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: all tests pass.

- [ ] **Step 6: Commit if repository exists**

```bash
git add CMakeLists.txt engine/include/robolocks/types.hpp engine/include/robolocks/math.hpp engine/src/math.cpp engine/tests/math_test.cpp
git commit -m "feat: add deterministic math primitives"
```

---

### Task 3: Match Config, Orders, and Snapshots

**Files:**
- Create: `engine/include/robolocks/command.hpp`
- Create: `engine/include/robolocks/match_config.hpp`
- Create: `engine/include/robolocks/snapshot.hpp`
- Create: `engine/tests/command_test.cpp`
- Modify: `CMakeLists.txt`

**Interfaces:**
- Consumes: `Vec2`, `UnitId`, `Tick`
- Produces: `Order`, `OrderKind`, `OrderChannel`, `MoveToOrder`, `AimAtOrder`, `FireIfSolutionOrder`
- Produces: `order_channel(OrderKind) -> OrderChannel`
- Produces: `MatchConfig`, `TankPreset`, `WorldSnapshot`, `UnitSnapshot`, `Event`

- [ ] **Step 1: Write command channel tests**

Create `engine/tests/command_test.cpp`:

```cpp
#include <catch2/catch_test_macros.hpp>
#include <robolocks/command.hpp>

TEST_CASE("command kinds map to control channels") {
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::MoveTo) == robolocks::OrderChannel::Mobility);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::AimAt) == robolocks::OrderChannel::Turret);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::FireIfSolution) == robolocks::OrderChannel::Weapon);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::ScanArc) == robolocks::OrderChannel::Sensor);
  REQUIRE(robolocks::order_channel(robolocks::OrderKind::FaceArmorToward) == robolocks::OrderChannel::Hull);
}
```

- [ ] **Step 2: Add test file to CMake and verify failure**

Modify `CMakeLists.txt`:

```cmake
add_executable(robolocks_tests
  engine/tests/version_test.cpp
  engine/tests/math_test.cpp
  engine/tests/command_test.cpp
)
```

Run: `cmake --build build-native --target robolocks_tests`

Expected: build fails because `robolocks/command.hpp` does not exist.

- [ ] **Step 3: Implement command types**

Create `engine/include/robolocks/command.hpp`:

```cpp
#pragma once

#include <robolocks/types.hpp>

#include <variant>
#include <vector>

namespace robolocks {

enum class OrderKind {
  MoveTo,
  AimAt,
  FireIfSolution,
  ScanArc,
  FaceArmorToward,
};

enum class OrderChannel {
  Mobility,
  Turret,
  Weapon,
  Sensor,
  Hull,
};

struct MoveToOrder {
  Vec2 position;
};

struct AimAtOrder {
  Vec2 target;
};

struct FireIfSolutionOrder {
  double min_hit_chance = 0.0;
};

struct ScanArcOrder {
  double center_deg = 0.0;
  double width_deg = 0.0;
};

struct FaceArmorTowardOrder {
  Vec2 target;
};

using OrderPayload = std::variant<
  MoveToOrder,
  AimAtOrder,
  FireIfSolutionOrder,
  ScanArcOrder,
  FaceArmorTowardOrder
>;

struct Order {
  OrderKind kind;
  OrderPayload payload;
};

using OrderList = std::vector<Order>;

OrderChannel order_channel(OrderKind kind);

}  // namespace robolocks
```

- [ ] **Step 4: Implement inline channel mapping**

Append to `engine/include/robolocks/command.hpp` before the namespace close:

```cpp
inline OrderChannel order_channel(OrderKind kind) {
  switch (kind) {
    case OrderKind::MoveTo:
      return OrderChannel::Mobility;
    case OrderKind::AimAt:
      return OrderChannel::Turret;
    case OrderKind::FireIfSolution:
      return OrderChannel::Weapon;
    case OrderKind::ScanArc:
      return OrderChannel::Sensor;
    case OrderKind::FaceArmorToward:
      return OrderChannel::Hull;
  }
  return OrderChannel::Mobility;
}
```

- [ ] **Step 5: Add match config and snapshot types**

Create `engine/include/robolocks/match_config.hpp`:

```cpp
#pragma once

#include <robolocks/types.hpp>

#include <string>
#include <vector>

namespace robolocks {

struct TankPreset {
  UnitId unit_id;
  std::string name;
  Vec2 spawn_position;
  double max_speed_mps = 8.0;
  double armor_integrity = 100.0;
};

struct MatchConfig {
  std::string match_id = "preset_duel_v0";
  std::uint32_t seed = 1;
  double tick_dt_sec = 1.0 / 30.0;
  Tick tick_limit = 9000;
  std::vector<TankPreset> tanks;
};

}  // namespace robolocks
```

Create `engine/include/robolocks/snapshot.hpp`:

```cpp
#pragma once

#include <robolocks/types.hpp>

#include <string>
#include <vector>

namespace robolocks {

struct UnitSnapshot {
  UnitId unit_id;
  Vec2 position;
  double hull_heading_deg = 0.0;
  double turret_heading_deg = 0.0;
  double armor_integrity = 100.0;
};

struct Event {
  Tick tick = 0;
  UnitId unit_id;
  std::string code;
  std::string message;
};

struct WorldSnapshot {
  Tick tick = 0;
  std::vector<UnitSnapshot> units;
};

}  // namespace robolocks
```

- [ ] **Step 6: Run native tests**

Run: `cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: all tests pass.

- [ ] **Step 7: Commit if repository exists**

```bash
git add CMakeLists.txt engine/include/robolocks/command.hpp engine/include/robolocks/match_config.hpp engine/include/robolocks/snapshot.hpp engine/tests/command_test.cpp
git commit -m "feat: define match and command types"
```

---

### Task 4: Minimal Deterministic Match Step

**Files:**
- Create: `engine/include/robolocks/match.hpp`
- Create: `engine/src/match.cpp`
- Create: `engine/tests/match_test.cpp`
- Modify: `CMakeLists.txt`

**Interfaces:**
- Consumes: `MatchConfig`, `OrderList`, `WorldSnapshot`
- Produces: `Match`
- Produces: `Match::snapshot() const -> WorldSnapshot`
- Produces: `Match::step(const std::vector<UnitOrders>& orders) -> StepResult`
- Produces: `UnitOrders`, `StepResult`

- [ ] **Step 1: Write deterministic movement test**

Create `engine/tests/match_test.cpp`:

```cpp
#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>
#include <robolocks/command.hpp>
#include <robolocks/match.hpp>

TEST_CASE("match step moves tank toward MoveTo target deterministically") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .spawn_position = robolocks::Vec2{0.0, 0.0},
      .max_speed_mps = 2.0,
      .armor_integrity = 100.0,
    },
  };

  robolocks::Match match(config);

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = match.step({
    robolocks::UnitOrders{robolocks::UnitId{1}, {move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
}

TEST_CASE("same orders produce same snapshots") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 100.0},
  };

  robolocks::Order move{
    .kind = robolocks::OrderKind::MoveTo,
    .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Match a(config);
  robolocks::Match b(config);

  const auto ar = a.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});
  const auto br = b.step({robolocks::UnitOrders{robolocks::UnitId{1}, {move}}});

  REQUIRE(ar.snapshot.units[0].position.x == Catch::Approx(br.snapshot.units[0].position.x));
  REQUIRE(ar.snapshot.units[0].position.y == Catch::Approx(br.snapshot.units[0].position.y));
}
```

- [ ] **Step 2: Add match files to CMake and verify failure**

Modify `CMakeLists.txt`:

```cmake
add_library(robolocks_core
  engine/src/version.cpp
  engine/src/math.cpp
  engine/src/match.cpp
)
```

Modify `robolocks_tests` source list:

```cmake
add_executable(robolocks_tests
  engine/tests/version_test.cpp
  engine/tests/math_test.cpp
  engine/tests/command_test.cpp
  engine/tests/match_test.cpp
)
```

Run: `cmake --build build-native --target robolocks_tests`

Expected: build fails because `robolocks/match.hpp` and `engine/src/match.cpp` do not exist.

- [ ] **Step 3: Implement match API**

Create `engine/include/robolocks/match.hpp`:

```cpp
#pragma once

#include <robolocks/command.hpp>
#include <robolocks/match_config.hpp>
#include <robolocks/snapshot.hpp>

#include <vector>

namespace robolocks {

struct UnitOrders {
  UnitId unit_id;
  OrderList orders;
};

struct StepResult {
  WorldSnapshot snapshot;
  std::vector<Event> events;
};

class Match {
 public:
  explicit Match(MatchConfig config);

  WorldSnapshot snapshot() const;
  StepResult step(const std::vector<UnitOrders>& orders_by_unit);

 private:
  struct UnitState {
    UnitId unit_id;
    Vec2 position;
    double hull_heading_deg = 0.0;
    double turret_heading_deg = 0.0;
    double max_speed_mps = 0.0;
    double armor_integrity = 100.0;
  };

  double tick_dt_sec_ = 1.0 / 30.0;
  Tick tick_ = 0;
  std::vector<UnitState> units_;
};

}  // namespace robolocks
```

- [ ] **Step 4: Implement match step**

Create `engine/src/match.cpp`:

```cpp
#include <robolocks/match.hpp>

#include <robolocks/math.hpp>

#include <optional>

namespace robolocks {

Match::Match(MatchConfig config) : tick_dt_sec_(config.tick_dt_sec) {
  units_.reserve(config.tanks.size());
  for (const auto& tank : config.tanks) {
    units_.push_back(UnitState{
      .unit_id = tank.unit_id,
      .position = tank.spawn_position,
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .max_speed_mps = tank.max_speed_mps,
      .armor_integrity = tank.armor_integrity,
    });
  }
}

WorldSnapshot Match::snapshot() const {
  WorldSnapshot out;
  out.tick = tick_;
  out.units.reserve(units_.size());
  for (const auto& unit : units_) {
    out.units.push_back(UnitSnapshot{
      .unit_id = unit.unit_id,
      .position = unit.position,
      .hull_heading_deg = unit.hull_heading_deg,
      .turret_heading_deg = unit.turret_heading_deg,
      .armor_integrity = unit.armor_integrity,
    });
  }
  return out;
}

StepResult Match::step(const std::vector<UnitOrders>& orders_by_unit) {
  std::vector<Event> events;

  for (auto& unit : units_) {
    std::optional<MoveToOrder> move_to;
    bool duplicate_mobility = false;

    for (const auto& unit_orders : orders_by_unit) {
      if (!(unit_orders.unit_id == unit.unit_id)) {
        continue;
      }

      for (const auto& command : unit_orders.orders) {
        if (order_channel(command.kind) != OrderChannel::Mobility) {
          continue;
        }

        if (move_to.has_value()) {
          duplicate_mobility = true;
          continue;
        }

        if (const auto* payload = std::get_if<MoveToOrder>(&command.payload)) {
          move_to = *payload;
        }
      }
    }

    if (duplicate_mobility) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_mobility_command",
        .message = "Mobility channel rejected because multiple orders were returned.",
      });
      move_to.reset();
    }

    if (move_to.has_value()) {
      const double max_distance = unit.max_speed_mps * tick_dt_sec_;
      unit.position = advance_toward(unit.position, move_to->position, max_distance);
    }
  }

  tick_ += 1;
  return StepResult{snapshot(), events};
}

}  // namespace robolocks
```

- [ ] **Step 5: Run native tests**

Run: `cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: all tests pass.

- [ ] **Step 6: Commit if repository exists**

```bash
git add CMakeLists.txt engine/include/robolocks/match.hpp engine/src/match.cpp engine/tests/match_test.cpp
git commit -m "feat: add deterministic match stepping"
```

---

### Task 5: WASM Export Surface

**Files:**
- Create: `engine/wasm/wasm_exports.cpp`
- Create: `engine/wasm/README.md`
- Modify: `CMakeLists.txt`

**Interfaces:**
- Consumes: `robolocks::engine_version`
- Produces: WASM export function `robolocks_engine_version() -> const char*`
- Produces: CMake target `robolocks_wasm` when compiled with Emscripten

- [ ] **Step 1: Add WASM export source**

Create `engine/wasm/wasm_exports.cpp`:

```cpp
#include <robolocks/version.hpp>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define ROBOLOCKS_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define ROBOLOCKS_EXPORT
#endif

extern "C" {

ROBOLOCKS_EXPORT const char* robolocks_engine_version() {
  static const std::string version = robolocks::engine_version();
  return version.c_str();
}

}
```

- [ ] **Step 2: Document expected Emscripten build**

Create `engine/wasm/README.md`:

```markdown
# Robolocks WASM Kernel

The web MVP loads the C++ kernel through Emscripten. The first export is intentionally small:

- `robolocks_engine_version() -> const char*`

Later tasks add match creation, stepping, snapshots, and command submission exports. Keep this ABI data-oriented and serializable.
```

- [ ] **Step 3: Add conditional CMake target**

Append to `CMakeLists.txt`:

```cmake
if(EMSCRIPTEN)
  add_executable(robolocks_wasm
    engine/wasm/wasm_exports.cpp
  )

  target_link_libraries(robolocks_wasm PRIVATE robolocks_core)
  target_include_directories(robolocks_wasm PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/engine/include)

  target_link_options(robolocks_wasm PRIVATE
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_NAME=createRobolocksKernel"
    "SHELL:-sENVIRONMENT=worker"
    "SHELL:-sEXPORTED_FUNCTIONS=['_robolocks_engine_version']"
    "SHELL:-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap']"
  )
endif()
```

- [ ] **Step 4: Run native tests to ensure target does not break native build**

Run: `cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure`

Expected: all native tests pass.

- [ ] **Step 5: If Emscripten is installed, run WASM configure**

Run: `emcmake cmake -S . -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm --target robolocks_wasm`

Expected if Emscripten is installed: target builds and emits WASM/JS artifacts in `build-wasm`.

Expected if Emscripten is not installed: command fails with missing `emcmake`; note this as an environment prerequisite, not a code failure.

- [ ] **Step 6: Commit if repository exists**

```bash
git add CMakeLists.txt engine/wasm/wasm_exports.cpp engine/wasm/README.md
git commit -m "feat: add wasm kernel export scaffold"
```

---

### Task 6: Web Workspace and Worker Protocol Types

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/types/protocol.ts`
- Create: `web/src/main.ts`
- Create: `web/src/ui/app.ts`
- Create: `web/src/ui/styles.css`

**Interfaces:**
- Produces: `SimWorkerRequest`, `SimWorkerResponse`, `RunPresetDuelRequest`, `BattleFrame`
- Produces: `renderApp(root: HTMLElement): void`

- [ ] **Step 1: Create web package files**

Create `web/package.json`:

```json
{
  "name": "robolocks-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-basic-ssl": "^1.1.0",
    "vite": "^5.4.0",
    "typescript": "^5.5.0"
  },
  "devDependencies": {}
}
```

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "WebWorker"],
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `web/vite.config.ts`:

```ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
```

Create `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Robolocks</title>
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Define worker protocol types**

Create `web/src/types/protocol.ts`:

```ts
export type Vec2 = {
  x: number;
  y: number;
};

export type UnitFrame = {
  unitId: number;
  name: string;
  position: Vec2;
  armorIntegrity: number;
};

export type BattleEvent = {
  tick: number;
  unitId: number;
  code: string;
  message: string;
};

export type BattleFrame = {
  tick: number;
  units: UnitFrame[];
  events: BattleEvent[];
};

export type RunPresetDuelRequest = {
  type: "runPresetDuel";
  ticks: number;
};

export type SimWorkerRequest = RunPresetDuelRequest;

export type SimWorkerResponse =
  | { type: "battleFrame"; frame: BattleFrame }
  | { type: "battleComplete"; finalFrame: BattleFrame };
```

- [ ] **Step 3: Create minimal app shell**

Create `web/src/main.ts`:

```ts
import { renderApp } from "./ui/app";
import "./ui/styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root");
}

renderApp(root);
```

Create `web/src/ui/app.ts`:

```ts
import type { BattleFrame, SimWorkerResponse } from "../types/protocol";

export function renderApp(root: HTMLElement): void {
  root.innerHTML = `
    <section class="workbench">
      <aside class="panel">
        <h1>Robolocks</h1>
        <button id="run">Run Preset Duel</button>
        <pre id="log"></pre>
      </aside>
      <section class="battle_simulation" id="battle_simulation"></section>
    </section>
  `;

  const log = root.querySelector<HTMLPreElement>("#log");
  const battle_simulation = root.querySelector<HTMLElement>("#battle_simulation");
  const run = root.querySelector<HTMLButtonElement>("#run");

  if (!log || !battle_simulation || !run) {
    throw new Error("Workbench elements were not created");
  }

  const worker = new Worker(new URL("../sim/simWorker.ts", import.meta.url), {
    type: "module",
  });

  worker.onmessage = (event: MessageEvent<SimWorkerResponse>) => {
    if (event.data.type === "battleFrame" || event.data.type === "battleComplete") {
      drawFrame(battle_simulation, event.data.type === "battleFrame" ? event.data.frame : event.data.finalFrame);
      log.textContent = JSON.stringify(event.data, null, 2);
    }
  };

  run.addEventListener("click", () => {
    worker.postMessage({ type: "runPresetDuel", ticks: 120 });
  });
}

function drawFrame(container: HTMLElement, frame: BattleFrame): void {
  container.innerHTML = "";
  for (const unit of frame.units) {
    const node = document.createElement("div");
    node.className = "tank";
    node.textContent = unit.name;
    node.style.left = `${unit.position.x * 8 + 40}px`;
    node.style.top = `${unit.position.y * 8 + 40}px`;
    container.appendChild(node);
  }
}
```

Create `web/src/ui/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #151715;
  color: #edf0ea;
}

.workbench {
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: 100vh;
}

.panel {
  border-right: 1px solid #30362f;
  padding: 16px;
  background: #1f231f;
}

.panel h1 {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 700;
}

button {
  width: 100%;
  border: 1px solid #52604f;
  background: #d4e164;
  color: #11140f;
  padding: 10px 12px;
  font-weight: 700;
  cursor: pointer;
}

pre {
  overflow: auto;
  max-height: calc(100vh - 92px);
  font-size: 11px;
  color: #c9d0c2;
}

.battle_simulation {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    #2a3028;
  background-size: 32px 32px;
}

.tank {
  position: absolute;
  width: 64px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid #0d0f0c;
  background: #8e9a58;
  color: #11140f;
  font-size: 11px;
  font-weight: 700;
}
```

- [ ] **Step 4: Add temporary worker stub**

Create `web/src/sim/simWorker.ts`:

```ts
import type { BattleFrame, SimWorkerRequest, SimWorkerResponse } from "../types/protocol";

function post(response: SimWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  if (event.data.type !== "runPresetDuel") {
    return;
  }

  const frame: BattleFrame = {
    tick: event.data.ticks,
    units: [
      { unitId: 1, name: "Blue", position: { x: 10, y: 12 }, armorIntegrity: 100 },
      { unitId: 2, name: "Red", position: { x: 30, y: 12 }, armorIntegrity: 100 },
    ],
    events: [],
  };

  post({ type: "battleComplete", finalFrame: frame });
};
```

- [ ] **Step 5: Install dependencies and typecheck**

Run: `cd web && npm install && npm run typecheck`

Expected: TypeScript exits successfully.

If network access is blocked, rerun `npm install` with escalation approval or note that dependency installation is blocked by network policy.

- [ ] **Step 6: Commit if repository exists**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/index.html web/src
git commit -m "feat: add web workbench skeleton"
```

---

### Task 7: TypeScript Kernel Adapter and Preset Duel Loop

**Files:**
- Create: `web/src/sim/kernelAdapter.ts`
- Modify: `web/src/sim/simWorker.ts`
- Modify: `web/src/types/protocol.ts`

**Interfaces:**
- Consumes: `BattleFrame`, `SimWorkerRequest`, `SimWorkerResponse`
- Produces: `createPresetDuel(): KernelMatch`
- Produces: `KernelMatch.step(): BattleFrame`

- [ ] **Step 1: Add adapter types and deterministic fallback implementation**

Create `web/src/sim/kernelAdapter.ts`:

```ts
import type { BattleFrame, UnitFrame } from "../types/protocol";

type InternalUnit = UnitFrame & {
  target: { x: number; y: number };
  speed: number;
};

export type KernelMatch = {
  step(): BattleFrame;
};

export function createPresetDuel(): KernelMatch {
  let tick = 0;
  const units: InternalUnit[] = [
    { unitId: 1, name: "Blue", position: { x: 6, y: 12 }, armorIntegrity: 100, target: { x: 20, y: 12 }, speed: 0.2 },
    { unitId: 2, name: "Red", position: { x: 34, y: 12 }, armorIntegrity: 100, target: { x: 20, y: 12 }, speed: 0.2 },
  ];

  return {
    step(): BattleFrame {
      tick += 1;
      for (const unit of units) {
        unit.position = advanceToward(unit.position, unit.target, unit.speed);
      }
      return {
        tick,
        units: units.map((unit) => ({
          unitId: unit.unitId,
          name: unit.name,
          position: { ...unit.position },
          armorIntegrity: unit.armorIntegrity,
        })),
        events: [],
      };
    },
  };
}

function advanceToward(from: { x: number; y: number }, to: { x: number; y: number }, maxDistance: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len <= maxDistance || len <= 0) {
    return { ...to };
  }
  return {
    x: from.x + (dx / len) * maxDistance,
    y: from.y + (dy / len) * maxDistance,
  };
}
```

Note: this adapter is a temporary web-side fallback until the WASM match exports are available. Keep all UI code dependent on `KernelMatch`, not on this implementation.

- [ ] **Step 2: Update worker to stream frames**

Replace `web/src/sim/simWorker.ts` with:

```ts
import { createPresetDuel } from "./kernelAdapter";
import type { BattleFrame, SimWorkerRequest, SimWorkerResponse } from "../types/protocol";

function post(response: SimWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  if (event.data.type !== "runPresetDuel") {
    return;
  }

  const match = createPresetDuel();
  let frame: BattleFrame = match.step();

  for (let i = 1; i < event.data.ticks; i += 1) {
    frame = match.step();
    post({ type: "battleFrame", frame });
  }

  post({ type: "battleComplete", finalFrame: frame });
};
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npm run typecheck`

Expected: TypeScript exits successfully.

- [ ] **Step 4: Build web app**

Run: `cd web && npm run build`

Expected: Vite build succeeds.

- [ ] **Step 5: Commit if repository exists**

```bash
git add web/src/sim/kernelAdapter.ts web/src/sim/simWorker.ts web/src/types/protocol.ts
git commit -m "feat: run preset duel through sim worker"
```

---

### Task 8: Fixtures and Documentation for First Vertical Slice

**Files:**
- Create: `fixtures/maps/duel_grid_v0.json`
- Create: `fixtures/matches/preset_duel_v0.json`
- Create: `docs/architecture/engine-boundary.md`
- Modify: `docs/superpowers/specs/2026-07-06-robolocks-mvp-design.md` only if implementation uncovered a spec correction

**Interfaces:**
- Consumes: planned match/map concepts from the design spec
- Produces: first map fixture and preset match fixture for later parser tasks

- [ ] **Step 1: Create first map fixture**

Create `fixtures/maps/duel_grid_v0.json`:

```json
{
  "id": "duel_grid_v0",
  "width": 40,
  "height": 24,
  "cellSizeM": 10,
  "cells": [],
  "obstacles": [
    { "x": 19, "y": 8, "width": 2, "height": 8, "blocksMovement": true, "blocksLineOfSight": true, "cover": 1.0 }
  ]
}
```

- [ ] **Step 2: Create preset match fixture**

Create `fixtures/matches/preset_duel_v0.json`:

```json
{
  "battleId": "preset_duel_v0",
  "mapId": "duel_grid_v0",
  "seed": 1,
  "tickRate": 30,
  "tickLimit": 9000,
  "league": {
    "id": "standard_500",
    "pointLimit": 500
  },
  "tanks": [
    {
      "unitId": 1,
      "name": "Blue",
      "spawn": { "x": 6, "y": 12 },
      "preset": "standard_blue_v0"
    },
    {
      "unitId": 2,
      "name": "Red",
      "spawn": { "x": 34, "y": 12 },
      "preset": "standard_red_v0"
    }
  ]
}
```

- [ ] **Step 3: Document the engine boundary**

Create `docs/architecture/engine-boundary.md`:

```markdown
# Engine Boundary

Robolocks keeps simulation logic inside the engine kernel. UI, renderer, editor, and workers can request state transitions, but they do not own combat rules.

## Current Boundary

- C++ native target: used for tests and headless validation.
- C++ WASM target: used by the browser runtime.
- TypeScript worker: owns message passing and frame delivery.
- TypeScript UI: renders snapshots and events.

## Data Flow

```text
UI -> Simulation Worker -> Kernel step -> Snapshot/Event frame -> UI
```

Bot execution follows the same rule:

```text
Observation -> Bot Runtime -> Orders -> Kernel step
```

## Determinism Rule

The same engine version, runtime target, config, seed, catalog version, map, and orders must reproduce the same battle.
```

- [ ] **Step 4: Verify fixture JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('fixtures/maps/duel_grid_v0.json','utf8')); JSON.parse(require('fs').readFileSync('fixtures/matches/preset_duel_v0.json','utf8')); console.log('fixtures ok')"`

Expected: prints `fixtures ok`.

- [ ] **Step 5: Run final available checks**

Run:

```bash
cmake --build build-native --target robolocks_tests && ctest --test-dir build-native --output-on-failure
cd web && npm run build
```

Expected: native tests pass and web build succeeds.

- [ ] **Step 6: Commit if repository exists**

```bash
git add fixtures docs/architecture
git commit -m "docs: document engine boundary and first fixtures"
```

---

## Self-Review Notes

Spec coverage:

- C++/WASM kernel from the start: covered by Tasks 1 and 5.
- Native headless build/tests from day one: covered by Tasks 1 through 5.
- Fixed tick/no-delay loop: covered by Task 4 and Task 7.
- Worker-based web MVP: covered by Tasks 6 and 7.
- Preset-first build order: covered by Task 7 and Task 8.
- Module builder, catalog validation, sensors, ballistics, damage, replay, and tactical overlays are intentionally not implemented in this first plan; they require follow-up plans after the engine skeleton is running.

Known follow-up plans:

- Module catalog and build validation.
- Bot protocol and JS bot runtime.
- Observation model and order resolver expansion.
- Map grid, line of sight, and deterministic A*.
- Ballistics, armor, and damage channels.
- Replay recorder and viewer.
- Module builder UI and code editor integration.

