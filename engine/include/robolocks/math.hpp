#pragma once

#include <robolocks/battle_config.hpp>
#include <robolocks/types.hpp>

namespace robolocks {

inline constexpr double kPi = 3.14159265358979323846;

double clamp(double value, double min_value, double max_value);
double length(Vec2 v);
Vec2 normalize_or_zero(Vec2 v);
Vec2 advance_toward(Vec2 from, Vec2 to, double max_distance);
double normalize_angle_deg(double angle_deg);
double angle_to(Vec2 from, Vec2 to);
double shortest_angle_delta_deg(double from_deg, double to_deg);
double advance_angle_toward(double from_deg, double to_deg, double max_delta_deg);

double distance(Vec2 from, Vec2 to);
double dot(Vec2 a, Vec2 b);
Vec2 forward_vector(double heading_deg);
Vec2 right_vector(double heading_deg);
bool segment_intersects_circle(Vec2 a, Vec2 b, Vec2 center, double radius);
double collision_radius(const BodyShapeSpec& shape);

}  // namespace robolocks
