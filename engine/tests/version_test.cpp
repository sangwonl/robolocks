#include <catch2/catch_test_macros.hpp>
#include <robolocks/version.hpp>

TEST_CASE("engine version is exposed") {
  REQUIRE(robolocks::engine_version() == "0.1.0");
}
