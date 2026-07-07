#include <robolocks/presets.hpp>

namespace robolocks {

BattleConfig preset_duel_config() {
  BattleConfig config;
  config.tick_dt_sec = 1.0 / 30.0;
  config.obstacles = {
    StaticObstacle{
      .id = "north_cover",
      .position = Vec2{20.0, 6.0},
      .radius_m = 1.5,
      .blocks_movement = true,
      .blocks_line_of_sight = true,
    },
  };
  config.tanks = {
    TankPreset{
      .unit_id = UnitId{1},
      .name = "Blue",
      .transform = TransformComponent{
        .position = Vec2{6.0, 12.0},
        .hull_heading_deg = 0.0,
      },
      .mobility = MobilityComponent{
        .id = "tracked_chassis_mk1",
        .max_speed_mps = 6.0,
        .max_hull_turn_degps = 120.0,
      },
      .turret = TurretComponent{
        .id = "light_turret_mk1",
        .heading_deg = 0.0,
        .max_turn_degps = 180.0,
      },
      .weapon = WeaponComponent{
        .id = "cannon_75mm_mk1",
        .damage = 25.0,
        .penetration_mm = 120.0,
        .range_m = 80.0,
        .muzzle_velocity_mps = 620.0,
        .projectile_radius_m = 0.08,
        .aim_tolerance_deg = 5.0,
        .reload_ticks = 30,
      },
      .armor = ArmorComponent{
        .id = "rolled_armor_mk1",
        .integrity = 100.0,
        .front_mm = 100.0,
        .side_mm = 70.0,
        .rear_mm = 45.0,
      },
      .body = BodyComponent{
        .id = "medium_hull_mk1",
        .shape = BodyShapeComponent{
          .type = BodyShapeType::Box,
          .radius_m = 1.2,
          .length_m = 5.6,
          .width_m = 2.8,
        },
      },
      .sensor = SensorComponent{
        .id = "visual_optic_mk1",
        .range_m = 60.0,
        .fov_deg = 120.0,
        .refresh_ticks = 1,
      },
    },
    TankPreset{
      .unit_id = UnitId{2},
      .name = "Red",
      .transform = TransformComponent{
        .position = Vec2{34.0, 12.0},
        .hull_heading_deg = 180.0,
      },
      .mobility = MobilityComponent{
        .id = "tracked_chassis_mk1",
        .max_speed_mps = 6.0,
        .max_hull_turn_degps = 120.0,
      },
      .turret = TurretComponent{
        .id = "light_turret_mk1",
        .heading_deg = 180.0,
        .max_turn_degps = 180.0,
      },
      .weapon = WeaponComponent{
        .id = "cannon_75mm_mk1",
        .damage = 25.0,
        .penetration_mm = 120.0,
        .range_m = 80.0,
        .muzzle_velocity_mps = 620.0,
        .projectile_radius_m = 0.08,
        .aim_tolerance_deg = 5.0,
        .reload_ticks = 30,
      },
      .armor = ArmorComponent{
        .id = "rolled_armor_mk1",
        .integrity = 100.0,
        .front_mm = 100.0,
        .side_mm = 70.0,
        .rear_mm = 45.0,
      },
      .body = BodyComponent{
        .id = "medium_hull_mk1",
        .shape = BodyShapeComponent{
          .type = BodyShapeType::Box,
          .radius_m = 1.2,
          .length_m = 5.6,
          .width_m = 2.8,
        },
      },
      .sensor = SensorComponent{
        .id = "visual_optic_mk1",
        .range_m = 60.0,
        .fov_deg = 120.0,
        .refresh_ticks = 1,
      },
    },
  };
  return config;
}

}  // namespace robolocks
