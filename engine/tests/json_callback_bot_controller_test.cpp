#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/json_callback_bot_controller.hpp>

#include <nlohmann/json.hpp>

TEST_CASE("json callback bot controller lets the runner own bot ticks through a callback backend") {
  std::uint32_t called_bot_id = 0;
  nlohmann::json received_observation;

  robolocks::JsonCallbackBotController controller(
    robolocks::UnitId{7},
    [&](robolocks::UnitId bot_id, const std::string& observation_json) {
      called_bot_id = bot_id.value;
      received_observation = nlohmann::json::parse(observation_json);
      return R"json({
        "orders": [
          {"type": "faceArmorToward", "target": {"x": 11.0, "y": 12.0}},
          {"type": "moveTo", "position": {"x": 17.0, "y": 12.0}}
        ]
      })json";
    }
  );

  robolocks::Observation observation;
  observation.tick = 3;
  observation.self_id = robolocks::UnitId{7};
  observation.self = robolocks::UnitSnapshot{
    .unit_id = robolocks::UnitId{7},
    .position = robolocks::Vec2{4.0, 5.0},
    .hull_heading_deg = 35.0,
    .turret_heading_deg = 35.0,
    .armor_integrity = 100.0,
    .body_shape_type = robolocks::BodyShapeType::Box,
  };

  const auto orders = controller.on_tick(observation);

  REQUIRE(called_bot_id == 7);
  REQUIRE(received_observation.at("tick") == 3);
  REQUIRE(received_observation.at("selfId") == 7);
  REQUIRE(received_observation.at("self").at("position").at("x") == Catch::Approx(4.0));
  REQUIRE(orders.size() == 2);
  REQUIRE(orders[0].kind == robolocks::OrderKind::FaceArmorToward);
  REQUIRE(std::get<robolocks::FaceArmorTowardOrder>(orders[0].payload).target.x == Catch::Approx(11.0));
  REQUIRE(orders[1].kind == robolocks::OrderKind::MoveTo);
  REQUIRE(std::get<robolocks::MoveToOrder>(orders[1].payload).position.x == Catch::Approx(17.0));
}
