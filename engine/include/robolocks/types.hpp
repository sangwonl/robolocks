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

struct Vec3 {
  double x = 0.0;
  double y = 0.0;
  double z = 0.0;
};

}  // namespace robolocks
