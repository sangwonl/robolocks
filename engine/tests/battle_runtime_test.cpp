#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/battle_runtime.hpp>
#include <robolocks/bot_controller.hpp>

#include <memory>

namespace {

class RecordingController final : public robolocks::BotController {
 public:
  robolocks::Observation last_observation;

  robolocks::OrderList on_tick(const robolocks::Observation& observation) override {
    last_observation = observation;
    return {
      robolocks::Order{
        .kind = robolocks::OrderKind::MoveTo,
        .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
      },
    };
  }
};

robolocks::TankPreset make_tank(
  robolocks::UnitId unit_id,
  const char* name,
  robolocks::Vec2 position,
  double max_speed_mps = 2.0,
  double armor_integrity = 100.0,
  double hull_heading_deg = 0.0,
  double turret_heading_deg = 0.0,
  robolocks::SensorComponent sensor = {}
) {
  return robolocks::TankPreset{
    .unit_id = unit_id,
    .name = name,
    .transform = robolocks::TransformComponent{
      .position = position,
      .hull_heading_deg = hull_heading_deg,
    },
    .mobility = robolocks::MobilityComponent{
      .max_speed_mps = max_speed_mps,
      .max_hull_turn_degps = 120.0,
    },
    .turret = robolocks::TurretComponent{
      .heading_deg = turret_heading_deg,
      .max_turn_degps = 180.0,
    },
    .armor = robolocks::ArmorComponent{
      .integrity = armor_integrity,
    },
    .sensor = sensor,
  };
}

}  // namespace

TEST_CASE("preset duel runner owns order generation and advances ticks") {
  auto runner = robolocks::BattleRuntime::preset_duel();

  REQUIRE(runner.snapshot().tick == 0);

  const auto first = runner.step_once();
  REQUIRE(first.snapshot.tick == 1);
  REQUIRE(first.snapshot.units.size() == 2);
  REQUIRE(first.snapshot.units[0].position.x == Catch::Approx(6.2));
  REQUIRE(first.snapshot.units[1].position.x == Catch::Approx(33.8));

  runner.run_ticks(119);
  const auto snapshot = runner.snapshot();

  REQUIRE(snapshot.tick == 120);
  REQUIRE(snapshot.units.size() == 2);
  REQUIRE(snapshot.units[0].position.x == Catch::Approx(17.0));
  REQUIRE(snapshot.units[0].turret_heading_deg == Catch::Approx(0.0));
  REQUIRE(snapshot.units[0].hull_heading_deg == Catch::Approx(0.0));
  REQUIRE(snapshot.units[1].position.x == Catch::Approx(23.0));
  REQUIRE(snapshot.units[1].turret_heading_deg == Catch::Approx(180.0));
  REQUIRE(snapshot.units[1].hull_heading_deg == Catch::Approx(180.0));
}

TEST_CASE("runner can execute externally supplied commands without controllers") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
  };

  robolocks::BattleRuntime runner(config);
  const auto result = runner.step_once({
    robolocks::UnitOrders{
      robolocks::UnitId{1},
      {
        robolocks::Order{
          .kind = robolocks::OrderKind::MoveTo,
          .payload = robolocks::MoveToOrder{robolocks::Vec2{10.0, 0.0}},
        },
      },
    },
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
}

TEST_CASE("battle runtime calls bot controllers with per-unit observations") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}),
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{5.0, 0.0}),
  };

  auto controller = std::make_unique<RecordingController>();
  auto* raw_controller = controller.get();

  std::vector<robolocks::ControllerBinding> controllers;
  controllers.push_back(robolocks::ControllerBinding{robolocks::UnitId{1}, std::move(controller)});

  robolocks::BattleRuntime runner(config, std::move(controllers));
  const auto result = runner.step_once();

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(raw_controller->last_observation.tick == 0);
  REQUIRE(raw_controller->last_observation.self_id == robolocks::UnitId{1});
  REQUIRE(raw_controller->last_observation.self.unit_id == robolocks::UnitId{1});
  REQUIRE(raw_controller->last_observation.contacts.size() == 1);
  REQUIRE(raw_controller->last_observation.contacts[0].unit_id == robolocks::UnitId{2});
  REQUIRE(raw_controller->last_observation.contacts[0].position.x == Catch::Approx(5.0));
}

TEST_CASE("battle runtime limits bot observations through tank sensor specs") {
  robolocks::BattleConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    make_tank(
      robolocks::UnitId{1},
      "Blue",
      robolocks::Vec2{0.0, 0.0},
      2.0,
      100.0,
      0.0,
      0.0,
      robolocks::SensorComponent{
        .range_m = 10.0,
        .fov_deg = 90.0,
        .refresh_ticks = 1,
      }
    ),
    make_tank(robolocks::UnitId{2}, "Red", robolocks::Vec2{0.0, 8.0}),
  };

  auto controller = std::make_unique<RecordingController>();
  auto* raw_controller = controller.get();

  std::vector<robolocks::ControllerBinding> controllers;
  controllers.push_back(robolocks::ControllerBinding{robolocks::UnitId{1}, std::move(controller)});

  robolocks::BattleRuntime runner(config, std::move(controllers));
  runner.step_once();

  REQUIRE(raw_controller->last_observation.contacts.empty());
}
