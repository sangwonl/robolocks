#include <robolocks/match.hpp>

#include <robolocks/math.hpp>

#include <optional>

namespace robolocks {

Match::Match(MatchConfig config) : tick_dt_sec_(config.tick_dt_sec) {
  units_.reserve(config.tanks.size());
  for (const auto& tank : config.tanks) {
    units_.push_back(UnitState{
      .unit_id = tank.unit_id,
      .position = tank.spawn_position,
      .hull_heading_deg = 0.0,
      .turret_heading_deg = 0.0,
      .max_speed_mps = tank.max_speed_mps,
      .armor_integrity = tank.armor_integrity,
    });
  }
}

WorldSnapshot Match::snapshot() const {
  WorldSnapshot out;
  out.tick = tick_;
  out.units.reserve(units_.size());
  for (const auto& unit : units_) {
    out.units.push_back(UnitSnapshot{
      .unit_id = unit.unit_id,
      .position = unit.position,
      .hull_heading_deg = unit.hull_heading_deg,
      .turret_heading_deg = unit.turret_heading_deg,
      .armor_integrity = unit.armor_integrity,
    });
  }
  return out;
}

StepResult Match::step(const std::vector<UnitCommands>& commands_by_unit) {
  std::vector<Event> events;

  for (auto& unit : units_) {
    std::optional<MoveToCommand> move_to;
    bool duplicate_mobility = false;

    for (const auto& unit_commands : commands_by_unit) {
      if (!(unit_commands.unit_id == unit.unit_id)) {
        continue;
      }

      for (const auto& command : unit_commands.commands) {
        if (!command_payload_matches_kind(command)) {
          events.push_back(Event{
            .tick = tick_,
            .unit_id = unit.unit_id,
            .code = "invalid_command_payload_kind",
            .message = "Command payload variant does not match the declared command kind.",
          });
          continue;
        }

        if (command_channel(command.kind) != CommandChannel::Mobility) {
          continue;
        }

        if (move_to.has_value()) {
          duplicate_mobility = true;
          continue;
        }

        if (const auto* payload = std::get_if<MoveToCommand>(&command.payload)) {
          move_to = *payload;
        }
      }
    }

    if (duplicate_mobility) {
      events.push_back(Event{
        .tick = tick_,
        .unit_id = unit.unit_id,
        .code = "duplicate_mobility_command",
        .message = "Mobility channel rejected because multiple commands were returned.",
      });
      move_to.reset();
    }

    if (move_to.has_value()) {
      const double max_distance = unit.max_speed_mps * tick_dt_sec_;
      unit.position = advance_toward(unit.position, move_to->position, max_distance);
    }
  }

  tick_ += 1;
  return StepResult{snapshot(), events};
}

}  // namespace robolocks
