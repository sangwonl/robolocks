#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/command.hpp>
#include <robolocks/match.hpp>

TEST_CASE("match step moves tank toward MoveTo target deterministically") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{
      .unit_id = robolocks::UnitId{1},
      .name = "Blue",
      .spawn_position = robolocks::Vec2{0.0, 0.0},
      .max_speed_mps = 2.0,
      .armor_integrity = 100.0,
    },
  };

  robolocks::Match match(config);

  robolocks::Command move{
    .kind = robolocks::CommandKind::MoveTo,
    .payload = robolocks::MoveToCommand{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = match.step({
    robolocks::UnitCommands{robolocks::UnitId{1}, {move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(2.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
}

TEST_CASE("same commands produce same snapshots") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 100.0},
  };

  robolocks::Command move{
    .kind = robolocks::CommandKind::MoveTo,
    .payload = robolocks::MoveToCommand{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Match a(config);
  robolocks::Match b(config);

  const auto ar = a.step({robolocks::UnitCommands{robolocks::UnitId{1}, {move}}});
  const auto br = b.step({robolocks::UnitCommands{robolocks::UnitId{1}, {move}}});

  REQUIRE(ar.snapshot.units[0].position.x == Catch::Approx(br.snapshot.units[0].position.x));
  REQUIRE(ar.snapshot.units[0].position.y == Catch::Approx(br.snapshot.units[0].position.y));
}

TEST_CASE("match step ignores invalid command payloads and emits a diagnostic") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 100.0},
  };

  robolocks::Match match(config);

  robolocks::Command invalid_move{
    .kind = robolocks::CommandKind::MoveTo,
    .payload = robolocks::AimAtCommand{robolocks::Vec2{10.0, 0.0}},
  };

  const auto result = match.step({
    robolocks::UnitCommands{robolocks::UnitId{1}, {invalid_move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(0.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].tick == 0);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "invalid_command_payload_kind");
}

TEST_CASE("match step rejects duplicate mobility commands for one unit") {
  robolocks::MatchConfig config;
  config.tick_dt_sec = 1.0;
  config.tanks = {
    robolocks::TankPreset{robolocks::UnitId{1}, "Blue", robolocks::Vec2{0.0, 0.0}, 2.0, 100.0},
  };

  robolocks::Match match(config);

  robolocks::Command first_move{
    .kind = robolocks::CommandKind::MoveTo,
    .payload = robolocks::MoveToCommand{robolocks::Vec2{10.0, 0.0}},
  };

  robolocks::Command second_move{
    .kind = robolocks::CommandKind::MoveTo,
    .payload = robolocks::MoveToCommand{robolocks::Vec2{0.0, 10.0}},
  };

  const auto result = match.step({
    robolocks::UnitCommands{robolocks::UnitId{1}, {first_move, second_move}},
  });

  REQUIRE(result.snapshot.tick == 1);
  REQUIRE(result.snapshot.units.size() == 1);
  REQUIRE(result.snapshot.units[0].position.x == Catch::Approx(0.0));
  REQUIRE(result.snapshot.units[0].position.y == Catch::Approx(0.0));
  REQUIRE(result.events.size() == 1);
  REQUIRE(result.events[0].tick == 0);
  REQUIRE(result.events[0].unit_id == robolocks::UnitId{1});
  REQUIRE(result.events[0].code == "duplicate_mobility_command");
}
