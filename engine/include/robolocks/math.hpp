#pragma once

#include <robolocks/types.hpp>

namespace robolocks {

double clamp(double value, double min_value, double max_value);
double length(Vec2 v);
Vec2 normalize_or_zero(Vec2 v);
Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance);
double normalize_angle_deg(double angle_deg);
double angle_to(Vec2 from, Vec2 to);
double shortest_angle_delta_deg(double from_deg, double to_deg);
double advance_angle_toward(double from_deg, double to_deg, double max_delta_deg);

}  // namespace robolocks
