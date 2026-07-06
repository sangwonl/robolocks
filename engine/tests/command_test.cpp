#include <catch2/catch_test_macros.hpp>

#include <robolocks/command.hpp>

TEST_CASE("command kinds map to control channels") {
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::MoveTo) == robolocks::CommandChannel::Mobility);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::AimAt) == robolocks::CommandChannel::Turret);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::FireIfSolution) == robolocks::CommandChannel::Weapon);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::ScanArc) == robolocks::CommandChannel::Sensor);
  REQUIRE(robolocks::command_channel(robolocks::CommandKind::FaceArmorToward) == robolocks::CommandChannel::Hull);
}

TEST_CASE("command payload kind matches the payload type") {
  const robolocks::Command move_to_command{
    robolocks::CommandKind::MoveTo,
    robolocks::MoveToCommand{{1.0, 2.0}}
  };

  const robolocks::Command mismatched_command{
    robolocks::CommandKind::MoveTo,
    robolocks::AimAtCommand{{3.0, 4.0}}
  };

  REQUIRE(robolocks::command_payload_kind(robolocks::AimAtCommand{{5.0, 6.0}}) == robolocks::CommandKind::AimAt);
  REQUIRE(robolocks::command_payload_matches_kind(move_to_command));
  REQUIRE_FALSE(robolocks::command_payload_matches_kind(mismatched_command));
}
