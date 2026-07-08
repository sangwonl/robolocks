#include <robolocks/combat_resolution.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <cmath>

namespace robolocks {

namespace {

constexpr double kPi = 3.14159265358979323846;

}  // namespace

double direct_damage_after_penetration(double base_damage, double penetration_mm, double armor_mm) {
  if (armor_mm <= 0.0) {
    return base_damage * 1.5;
  }
  const double penetration_ratio = penetration_mm / armor_mm;
  const double multiplier = std::clamp(penetration_ratio, 1.0, 1.5);
  return base_damage * multiplier;
}

double splash_damage_at_distance(double base_damage, double impact_distance_m, double blast_radius_m) {
  if (blast_radius_m <= 0.0) {
    return impact_distance_m <= 0.0 ? base_damage : 0.0;
  }
  const double falloff = std::clamp(1.0 - impact_distance_m / blast_radius_m, 0.0, 1.0);
  return base_damage * falloff;
}

double ballistic_ideal_range_m(const WeaponSpec& weapon) {
  if (weapon.gravity_mps2 <= 0.0) {
    return weapon.range_m;
  }
  const double launch_angle_rad = weapon.launch_angle_deg * kPi / 180.0;
  const double horizontal_velocity = weapon.muzzle_velocity_mps * std::cos(launch_angle_rad);
  const double vertical_velocity = weapon.muzzle_velocity_mps * std::sin(launch_angle_rad);
  const double launch_height_m = std::max(0.0, weapon.muzzle_offset_m.z);
  const double flight_time = (
    vertical_velocity + std::sqrt(vertical_velocity * vertical_velocity + 2.0 * weapon.gravity_mps2 * launch_height_m)
  ) / weapon.gravity_mps2;
  return horizontal_velocity * flight_time;
}

double ballistic_range_hit_chance(const WeaponSpec& weapon, double distance_m, double target_radius_m) {
  if (weapon.fire_mode != WeaponFireMode::Ballistic) {
    return 1.0;
  }
  const double ideal_range = ballistic_ideal_range_m(weapon);
  const double tolerance = std::max(weapon.blast_radius_m, weapon.projectile_radius_m) + target_radius_m;
  if (tolerance <= 0.0) {
    return distance_m == ideal_range ? 1.0 : 0.0;
  }
  return std::clamp(1.0 - std::abs(distance_m - ideal_range) / tolerance, 0.0, 1.0);
}

}  // namespace robolocks
