#include <robolocks/json_field.hpp>

#include <stdexcept>

#include <nlohmann/json.hpp>

namespace robolocks {

double required_number(const nlohmann::json& object, const char* key, const char* field_label) {
  if (!object.contains(key) || !object.at(key).is_number()) {
    throw std::runtime_error(std::string("Expected numeric ") + field_label + ": " + key);
  }
  return object.at(key).get<double>();
}

double optional_number(
  const nlohmann::json& object,
  const char* key,
  double fallback,
  const char* field_label
) {
  if (!object.contains(key)) {
    return fallback;
  }
  return required_number(object, key, field_label);
}

std::string required_string(const nlohmann::json& object, const char* key, const char* field_label) {
  if (!object.contains(key) || !object.at(key).is_string()) {
    throw std::runtime_error(std::string("Expected string ") + field_label + ": " + key);
  }
  return object.at(key).get<std::string>();
}

Vec2 required_vec2(const nlohmann::json& object, const char* key, const char* field_label) {
  if (!object.contains(key) || !object.at(key).is_object()) {
    throw std::runtime_error(std::string("Expected vector ") + field_label + ": " + key);
  }
  const auto& vec = object.at(key);
  return Vec2{
    .x = required_number(vec, "x", field_label),
    .y = required_number(vec, "y", field_label),
  };
}

}  // namespace robolocks
