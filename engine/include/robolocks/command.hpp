#pragma once

#include <robolocks/types.hpp>

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

}  // namespace robolocks
