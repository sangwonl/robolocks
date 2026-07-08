#pragma once

#include <robolocks/battle_config.hpp>

namespace robolocks {

double direct_damage_after_penetration(double base_damage, double penetration_mm, double armor_mm);
double splash_damage_at_distance(double base_damage, double impact_distance_m, double blast_radius_m);
double ballistic_ideal_range_m(const WeaponSpec& weapon);
double ballistic_range_hit_chance(const WeaponSpec& weapon, double distance_m, double target_radius_m);

}  // namespace robolocks
