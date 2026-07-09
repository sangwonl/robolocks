#pragma once

#include <robolocks/types.hpp>

#include <nlohmann/json_fwd.hpp>

#include <string>

namespace robolocks {

// Shared typed JSON field readers used by both the battle config loader
// (battle_loader.cpp) and the bot controller protocol parser
// (controller_protocol_json.cpp). The two callers historically kept
// byte-for-byte duplicated copies of these helpers that differed only in the
// error-message wording ("field" vs "order field"); `field_label` reproduces
// that wording so error text stays exactly as callers depend on it.
//
// `field_label` defaults to "field" (the battle loader's wording). The
// protocol parser passes "order field" explicitly at each call site.

double required_number(const nlohmann::json& object, const char* key, const char* field_label = "field");

double optional_number(
  const nlohmann::json& object,
  const char* key,
  double fallback,
  const char* field_label = "field"
);

std::string required_string(const nlohmann::json& object, const char* key, const char* field_label = "field");

Vec2 required_vec2(const nlohmann::json& object, const char* key, const char* field_label = "field");

}  // namespace robolocks
