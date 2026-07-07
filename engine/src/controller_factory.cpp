#include <robolocks/controller_factory.hpp>

#include <robolocks/builtin_controllers.hpp>
#include <robolocks/python_bot_controller.hpp>

#include <memory>
#include <stdexcept>

namespace robolocks {

std::vector<ControllerBinding> create_controllers(const std::vector<ControllerConfig>& configs) {
  std::vector<ControllerBinding> controllers;
  controllers.reserve(configs.size());

  for (const auto& config : configs) {
    if (config.type == "builtin") {
      if (config.id != "hold_line") {
        throw std::runtime_error("Unsupported builtin controller id: " + config.id);
      }
      controllers.push_back(create_hold_line_controller(config.unit_id, config.hold_position));
      continue;
    }

    if (config.type == "python") {
      const auto& path = config.resolved_path.empty() ? config.path : config.resolved_path;
      if (path.empty()) {
        throw std::runtime_error("Python controller requires path");
      }
      controllers.push_back(ControllerBinding{
        config.unit_id,
        std::make_unique<PythonBotController>(path),
      });
      continue;
    }

    throw std::runtime_error("Unsupported controller type: " + config.type);
  }

  return controllers;
}

}  // namespace robolocks
