#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <robolocks/python_bot_controller.hpp>

#include <filesystem>
#include <fstream>
#include <stdexcept>

TEST_CASE("python bot controller exchanges one JSONL tick with a bot process") {
  const auto script_path = std::filesystem::temp_directory_path() / "robolocks_python_bot_controller_test.py";
  {
    std::ofstream script(script_path);
    script << R"python(
import json
import sys

for line in sys.stdin:
    observation = json.loads(line)
    x = observation["self"]["position"]["x"] + 2.0
    y = observation["self"]["position"]["y"]
    print(json.dumps({
        "commands": [
            {"type": "moveTo", "position": {"x": x, "y": y}},
            {"type": "aimAt", "target": observation["contacts"][0]["position"]}
        ]
    }), flush=True)
)python";
  }

  robolocks::PythonBotController controller(script_path.string());

  robolocks::Observation observation;
  observation.tick = 7;
  observation.self_id = robolocks::UnitId{1};
  observation.self = robolocks::UnitSnapshot{
    robolocks::UnitId{1},
    robolocks::Vec2{6.0, 12.0},
    0.0,
    0.0,
    100.0,
  };
  observation.contacts.push_back(robolocks::ContactObservation{
    robolocks::UnitId{2},
    robolocks::Vec2{34.0, 12.0},
    180.0,
    180.0,
    100.0,
  });

  const auto commands = controller.on_tick(observation);

  REQUIRE(commands.size() == 2);
  REQUIRE(commands[0].kind == robolocks::OrderKind::MoveTo);
  const auto& move_to = std::get<robolocks::MoveToOrder>(commands[0].payload);
  REQUIRE(move_to.position.x == Catch::Approx(8.0));
  REQUIRE(move_to.position.y == Catch::Approx(12.0));

  REQUIRE(commands[1].kind == robolocks::OrderKind::AimAt);
  const auto& aim_at = std::get<robolocks::AimAtOrder>(commands[1].payload);
  REQUIRE(aim_at.target.x == Catch::Approx(34.0));
  REQUIRE(aim_at.target.y == Catch::Approx(12.0));
}

TEST_CASE("python bot controller fails a tick when the bot misses its response deadline") {
  const auto script_path = std::filesystem::temp_directory_path() / "robolocks_python_bot_controller_sleep_test.py";
  {
    std::ofstream script(script_path);
    script << R"python(
import sys
import time

for line in sys.stdin:
    time.sleep(1.0)
)python";
  }

  robolocks::PythonBotController controller(script_path.string(), 10);

  robolocks::Observation observation;
  observation.tick = 1;
  observation.self_id = robolocks::UnitId{1};
  observation.self = robolocks::UnitSnapshot{
    robolocks::UnitId{1},
    robolocks::Vec2{6.0, 12.0},
    0.0,
    0.0,
    100.0,
  };

  REQUIRE_THROWS_AS(controller.on_tick(observation), std::runtime_error);
}
