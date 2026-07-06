#pragma once

#include <robolocks/types.hpp>

namespace robolocks {

double clamp(double value, double min_value, double max_value);
double length(Vec2 v);
Vec2 normalize_or_zero(Vec2 v);
Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance);

}  // namespace robolocks
