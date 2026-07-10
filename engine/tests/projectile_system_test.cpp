#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/projectile_system.hpp>

TEST_CASE("projectile system advances direct projectile positions") {
  std::vector<robolocks::UnitState> units;
  robolocks::ProjectileSystem projectile_system{
    std::vector<robolocks::ProjectileState>{
      robolocks::ProjectileState{
        .projectile_id = 1,
        .owner_unit_id = robolocks::UnitId{1},
        .position = robolocks::Vec2{0.0, 0.0},
        .velocity = robolocks::Vec2{10.0, 0.0},
        .radius_m = 0.1,
        .remaining_range_m = 5.0,
      },
    },
  };

  const auto events = projectile_system.advance_projectiles(1, 0.1, units);

  const auto& projectiles = projectile_system.projectiles();
  REQUIRE(events.empty());
  REQUIRE(projectiles.size() == 1);
  REQUIRE(projectiles[0].previous_position.x == Catch::Approx(0.0));
  REQUIRE(projectiles[0].position.x == Catch::Approx(1.0));
  REQUIRE(projectiles[0].remaining_range_m == Catch::Approx(4.0));
}

TEST_CASE("projectile system retires projectiles that hit movement-blocking obstacles") {
  std::vector<robolocks::UnitState> units;
  robolocks::ProjectileSystem projectile_system{
    std::vector<robolocks::ProjectileState>{
      robolocks::ProjectileState{
        .projectile_id = 7,
        .owner_unit_id = robolocks::UnitId{1},
        .position = robolocks::Vec2{0.0, 0.0},
        .velocity = robolocks::Vec2{20.0, 0.0},
        .radius_m = 0.1,
        .remaining_range_m = 20.0,
      },
    },
  };

  const auto events = projectile_system.advance_projectiles(
    3,
    0.5,
    units,
    robolocks::BattleBounds{},
    {
      robolocks::StaticObstacle{
        .id = "cover",
        .position = robolocks::Vec2{5.0, 0.0},
        .radius_m = 1.0,
        .blocks_movement = true,
      },
    }
  );

  REQUIRE(projectile_system.projectiles().empty());
  REQUIRE(events.size() == 1);
  REQUIRE(events[0].code == "projectile_obstacle_collision");
  REQUIRE(events[0].message == "Projectile hit obstacle cover.");
  REQUIRE(events[0].payload.projectile_id == 7);
}

TEST_CASE("projectile system retires projectiles that leave battle bounds") {
  std::vector<robolocks::UnitState> units;
  robolocks::ProjectileSystem projectile_system{
    std::vector<robolocks::ProjectileState>{
      robolocks::ProjectileState{
        .projectile_id = 8,
        .owner_unit_id = robolocks::UnitId{1},
        .position = robolocks::Vec2{9.0, 5.0},
        .velocity = robolocks::Vec2{20.0, 0.0},
        .radius_m = 0.1,
        .remaining_range_m = 20.0,
      },
    },
  };

  const auto events = projectile_system.advance_projectiles(
    4,
    0.2,
    units,
    robolocks::BattleBounds{
      .min = robolocks::Vec2{0.0, 0.0},
      .max = robolocks::Vec2{10.0, 10.0},
    },
    {}
  );

  REQUIRE(projectile_system.projectiles().empty());
  REQUIRE(events.size() == 1);
  REQUIRE(events[0].code == "projectile_boundary_collision");
  REQUIRE(events[0].message == "Projectile left the battle bounds.");
  REQUIRE(events[0].payload.projectile_id == 8);
}
