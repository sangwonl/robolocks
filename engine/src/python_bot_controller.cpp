#include <robolocks/python_bot_controller.hpp>

#include <robolocks/controller_protocol_json.hpp>

#include <cerrno>
#include <cstring>
#include <stdexcept>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

#ifndef _WIN32
#include <signal.h>
#include <sys/select.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

namespace robolocks {

namespace {

std::runtime_error system_error(const std::string& context) {
  return std::runtime_error(context + ": " + std::strerror(errno));
}

}  // namespace

PythonBotController::PythonBotController(std::string script_path, int response_timeout_ms)
    : script_path_(std::move(script_path)), response_timeout_ms_(response_timeout_ms) {
  if (response_timeout_ms_ <= 0) {
    throw std::runtime_error("Python bot response timeout must be positive");
  }
  start();
}

PythonBotController::~PythonBotController() {
#ifndef _WIN32
  if (stdin_fd_ >= 0) {
    close(stdin_fd_);
    stdin_fd_ = -1;
  }
  if (stdout_fd_ >= 0) {
    close(stdout_fd_);
    stdout_fd_ = -1;
  }
  if (pid_ > 0) {
    int status = 0;
    const pid_t waited = waitpid(static_cast<pid_t>(pid_), &status, WNOHANG);
    if (waited == 0) {
      kill(static_cast<pid_t>(pid_), SIGTERM);
      for (int attempt = 0; attempt < 100; attempt += 1) {
        if (waitpid(static_cast<pid_t>(pid_), &status, WNOHANG) != 0) {
          pid_ = -1;
          return;
        }
        usleep(1000);
      }
      kill(static_cast<pid_t>(pid_), SIGKILL);
      waitpid(static_cast<pid_t>(pid_), &status, 0);
    }
    pid_ = -1;
  }
#endif
}

OrderList PythonBotController::on_tick(const Observation& observation) {
  const auto request = observation_to_json(observation).dump();
  write_line(request);
  const auto response = read_line();
  return orders_from_json(nlohmann::json::parse(response));
}

void PythonBotController::start() {
#ifdef _WIN32
  throw std::runtime_error("PythonBotController is not implemented on Windows yet");
#else
  int to_child[2] = {-1, -1};
  int from_child[2] = {-1, -1};
  if (pipe(to_child) != 0) {
    throw system_error("pipe stdin");
  }
  if (pipe(from_child) != 0) {
    close(to_child[0]);
    close(to_child[1]);
    throw system_error("pipe stdout");
  }

  const pid_t child_pid = fork();
  if (child_pid < 0) {
    close(to_child[0]);
    close(to_child[1]);
    close(from_child[0]);
    close(from_child[1]);
    throw system_error("fork python bot");
  }

  if (child_pid == 0) {
    dup2(to_child[0], STDIN_FILENO);
    dup2(from_child[1], STDOUT_FILENO);
    close(to_child[0]);
    close(to_child[1]);
    close(from_child[0]);
    close(from_child[1]);
    execlp("python3", "python3", script_path_.c_str(), static_cast<char*>(nullptr));
    _exit(127);
  }

  close(to_child[0]);
  close(from_child[1]);
  stdin_fd_ = to_child[1];
  stdout_fd_ = from_child[0];
  pid_ = static_cast<int>(child_pid);
#endif
}

void PythonBotController::write_line(const std::string& line) {
#ifdef _WIN32
  (void)line;
  throw std::runtime_error("PythonBotController is not implemented on Windows yet");
#else
  std::string payload = line;
  payload.push_back('\n');

  const char* cursor = payload.data();
  std::size_t remaining = payload.size();
  while (remaining > 0) {
    const ssize_t written = write(stdin_fd_, cursor, remaining);
    if (written < 0) {
      if (errno == EINTR) {
        continue;
      }
      throw system_error("write python bot stdin");
    }
    cursor += written;
    remaining -= static_cast<std::size_t>(written);
  }
#endif
}

std::string PythonBotController::read_line() {
#ifdef _WIN32
  throw std::runtime_error("PythonBotController is not implemented on Windows yet");
#else
  std::string line;
  char ch = '\0';
  while (true) {
    fd_set read_set;
    FD_ZERO(&read_set);
    FD_SET(stdout_fd_, &read_set);

    timeval timeout;
    timeout.tv_sec = response_timeout_ms_ / 1000;
    timeout.tv_usec = (response_timeout_ms_ % 1000) * 1000;

    const int ready = select(stdout_fd_ + 1, &read_set, nullptr, nullptr, &timeout);
    if (ready < 0) {
      if (errno == EINTR) {
        continue;
      }
      throw system_error("wait for python bot stdout");
    }
    if (ready == 0) {
      throw std::runtime_error("Python bot response deadline exceeded");
    }

    const ssize_t count = read(stdout_fd_, &ch, 1);
    if (count < 0) {
      if (errno == EINTR) {
        continue;
      }
      throw system_error("read python bot stdout");
    }
    if (count == 0) {
      throw std::runtime_error("Python bot exited before writing a order response");
    }
    if (ch == '\n') {
      return line;
    }
    line.push_back(ch);
  }
#endif
}

}  // namespace robolocks
