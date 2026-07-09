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

