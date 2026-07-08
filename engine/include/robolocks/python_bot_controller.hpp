#pragma once

#include <robolocks/bot_controller.hpp>

#include <string>

namespace robolocks {

class PythonBotController final : public BotController {
 public:
  explicit PythonBotController(std::string script_path, int response_timeout_ms = 1000);
  ~PythonBotController() override;

  PythonBotController(const PythonBotController&) = delete;
  PythonBotController& operator=(const PythonBotController&) = delete;

  void on_start(const UnitSpec& spec) override;
  OrderList on_tick(const Observation& observation) override;

 private:
  std::string script_path_;
  int response_timeout_ms_ = 1000;
  int stdin_fd_ = -1;
  int stdout_fd_ = -1;
  int pid_ = -1;

  void start();
  void write_line(const std::string& line);
  std::string read_line();
};

}  // namespace robolocks
