#pragma once

#include <robolocks/types.hpp>

#include <type_traits>
#include <variant>
#include <vector>

namespace robolocks {

enum class CommandKind {
  MoveTo,
  AimAt,
  FireIfSolution,
  ScanArc,
  FaceArmorToward,
};

enum class CommandChannel {
  Mobility,
  Turret,
  Weapon,
  Sensor,
  Hull,
};

struct MoveToCommand {
  Vec2 position;
};

struct AimAtCommand {
  Vec2 target;
};

struct FireIfSolutionCommand {
  double min_hit_chance = 0.0;
};

struct ScanArcCommand {
  double center_deg = 0.0;
  double width_deg = 0.0;
};

struct FaceArmorTowardCommand {
  Vec2 target;
};

using CommandPayload = std::variant<
  MoveToCommand,
  AimAtCommand,
  FireIfSolutionCommand,
  ScanArcCommand,
  FaceArmorTowardCommand
>;

struct Command {
  CommandKind kind;
  CommandPayload payload;
};

using CommandList = std::vector<Command>;

inline CommandChannel command_channel(CommandKind kind) {
  switch (kind) {
    case CommandKind::MoveTo:
      return CommandChannel::Mobility;
    case CommandKind::AimAt:
      return CommandChannel::Turret;
    case CommandKind::FireIfSolution:
      return CommandChannel::Weapon;
    case CommandKind::ScanArc:
      return CommandChannel::Sensor;
    case CommandKind::FaceArmorToward:
      return CommandChannel::Hull;
  }
  return CommandChannel::Mobility;
}

inline CommandKind command_payload_kind(const CommandPayload& payload) {
  return std::visit([](const auto& typed_payload) {
    using Payload = std::decay_t<decltype(typed_payload)>;
    if constexpr (std::is_same_v<Payload, MoveToCommand>) {
      return CommandKind::MoveTo;
    } else if constexpr (std::is_same_v<Payload, AimAtCommand>) {
      return CommandKind::AimAt;
    } else if constexpr (std::is_same_v<Payload, FireIfSolutionCommand>) {
      return CommandKind::FireIfSolution;
    } else if constexpr (std::is_same_v<Payload, ScanArcCommand>) {
      return CommandKind::ScanArc;
    } else {
      return CommandKind::FaceArmorToward;
    }
  }, payload);
}

inline bool command_payload_matches_kind(const Command& command) {
  return command.kind == command_payload_kind(command.payload);
}

}  // namespace robolocks
