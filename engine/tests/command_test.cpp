#include <catch2/catch_test_macros.hpp>

#include <robolocks/command.hpp>

TEST_CASE("command kinds map to control channels") {
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::MoveTo) == robolocks::CommandChannel::Mobility);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::AimAt) == robolocks::CommandChannel::Turret);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::FireIfSolution) == robolocks::CommandChannel::Weapon);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::ScanArc) == robolocks::CommandChannel::Sensor);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::FaceArmorToward) == robolocks::CommandChannel::Hull);
}
