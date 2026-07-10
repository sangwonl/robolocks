#include <robolocks/physics_system.hpp>

#include <robolocks/math.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <mutex>
#include <string>
#include <utility>

#if ROBOLOCKS_USE_JOLT
#include <Jolt/Jolt.h>
#include <Jolt/Core/Factory.h>
#include <Jolt/Core/JobSystemSingleThreaded.h>
#include <Jolt/Core/TempAllocator.h>
#include <Jolt/Physics/Body/BodyCreationSettings.h>
#include <Jolt/Physics/Body/BodyInterface.h>
#include <Jolt/Physics/Collision/Shape/BoxShape.h>
#include <Jolt/Physics/Collision/Shape/CylinderShape.h>
#include <Jolt/Physics/PhysicsSettings.h>
#include <Jolt/Physics/PhysicsSystem.h>
#include <Jolt/RegisterTypes.h>
#endif

namespace robolocks {

namespace {

constexpr double kPositionEpsilon = 1.0e-9;
constexpr double kMinCollisionMassKg = 1.0e-9;

struct BoxAxes {
  Vec2 forward;
  Vec2 right;
};

bool has_box_shape(const PhysicsBody& body) {
  return body.shape.type == BodyShapeType::Box && body.shape.length_m > 0.0 && body.shape.width_m > 0.0;
}

Vec2 scaled(Vec2 value, double amount) {
  return Vec2{value.x * amount, value.y * amount};
}

BoxAxes box_axes(double heading_deg) {
  const double radians = normalize_angle_deg(heading_deg) * kPi / 180.0;
  const Vec2 forward{std::cos(radians), std::sin(radians)};
  return BoxAxes{
    .forward = forward,
    .right = Vec2{-forward.y, forward.x},
  };
}

double box_projection_radius(const PhysicsBody& body, const BoxAxes& axes, Vec2 axis) {
  return (body.shape.length_m * 0.5) * std::abs(dot(axis, axes.forward)) +
         (body.shape.width_m * 0.5) * std::abs(dot(axis, axes.right));
}

Vec2 world_from_box_local(Vec2 local, const BoxAxes& axes) {
  return Vec2{
    axes.forward.x * local.x + axes.right.x * local.y,
    axes.forward.y * local.x + axes.right.y * local.y,
  };
}

Vec2 clamp_circle_to_bounds(Vec2 position, const BattleBounds& bounds, double radius) {
  return Vec2{
    clamp(position.x, bounds.min.x + radius, bounds.max.x - radius),
    clamp(position.y, bounds.min.y + radius, bounds.max.y - radius),
  };
}

double dot2(Vec2 a, Vec2 b) {
  return a.x * b.x + a.y * b.y;
}

Vec2 subtract(Vec2 a, Vec2 b) {
  return Vec2{a.x - b.x, a.y - b.y};
}

Vec2 add(Vec2 a, Vec2 b) {
  return Vec2{a.x + b.x, a.y + b.y};
}

Vec2 scale(Vec2 value, double factor) {
  return Vec2{value.x * factor, value.y * factor};
}

Vec2 closest_point_on_segment(Vec2 point, Vec2 a, Vec2 b) {
  const Vec2 ab = subtract(b, a);
  const double ab_len_sq = dot2(ab, ab);
  if (ab_len_sq <= 1e-9) {
    return a;
  }
  const double t = clamp(dot2(subtract(point, a), ab) / ab_len_sq, 0.0, 1.0);
  return add(a, scale(ab, t));
}

bool point_in_polygon(Vec2 point, const std::vector<Vec2>& vertices) {
  bool inside = false;
  for (std::size_t i = 0, j = vertices.size() - 1; i < vertices.size(); j = i++) {
    const Vec2 a = vertices[i];
    const Vec2 b = vertices[j];
    const bool crosses = ((a.y > point.y) != (b.y > point.y)) &&
      (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) == 0.0 ? 1e-9 : (b.y - a.y)) + a.x);
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

Vec2 closest_point_on_polygon(Vec2 point, const std::vector<Vec2>& vertices) {
  Vec2 closest = vertices.front();
  double closest_dist_sq = std::numeric_limits<double>::infinity();
  for (std::size_t i = 0; i < vertices.size(); ++i) {
    const Vec2 candidate = closest_point_on_segment(point, vertices[i], vertices[(i + 1) % vertices.size()]);
    const Vec2 delta = subtract(point, candidate);
    const double dist_sq = dot2(delta, delta);
    if (dist_sq < closest_dist_sq) {
      closest = candidate;
      closest_dist_sq = dist_sq;
    }
  }
  return closest;
}

double body_bounds_radius(const PhysicsBody& body) {
  if (!has_box_shape(body)) {
    return body.shape.radius_m;
  }
  const double half_length = body.shape.length_m * 0.5;
  const double half_width = body.shape.width_m * 0.5;
  return std::sqrt(half_length * half_length + half_width * half_width);
}

Vec2 clamp_body_to_bounds(const PhysicsBody& body, const BattleBounds& bounds) {
  if (bounds.shape == BattleBoundsShape::Circle) {
    const double body_radius = body_bounds_radius(body);
    const Vec2 delta = subtract(body.position, bounds.center);
    const double distance_from_center = length(delta);
    const double max_distance = std::max(0.0, bounds.radius_m - body_radius);
    if (distance_from_center <= max_distance || distance_from_center <= 1e-9) {
      return body.position;
    }
    return add(bounds.center, scale(delta, max_distance / distance_from_center));
  }

  if (bounds.shape == BattleBoundsShape::Polygon && bounds.vertices.size() >= 3) {
    if (point_in_polygon(body.position, bounds.vertices)) {
      return body.position;
    }
    return closest_point_on_polygon(body.position, bounds.vertices);
  }

  if (!has_box_shape(body)) {
    return clamp_circle_to_bounds(body.position, bounds, body.shape.radius_m);
  }

  const BoxAxes axes = box_axes(body.heading_deg);
  const double half_length = body.shape.length_m * 0.5;
  const double half_width = body.shape.width_m * 0.5;
  const double x_extent = std::abs(axes.forward.x) * half_length + std::abs(axes.right.x) * half_width;
  const double y_extent = std::abs(axes.forward.y) * half_length + std::abs(axes.right.y) * half_width;
  return Vec2{
    clamp(body.position.x, bounds.min.x + x_extent, bounds.max.x - x_extent),
    clamp(body.position.y, bounds.min.y + y_extent, bounds.max.y - y_extent),
  };
}

bool circle_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  const Vec2 delta{
    b.position.x - a.position.x,
    b.position.y - a.position.y,
  };
  const double distance = length(delta);
  const double min_distance = a.shape.radius_m + b.shape.radius_m;
  if (distance >= min_distance) {
    return false;
  }

  normal = Vec2{1.0, 0.0};
  if (distance > kPositionEpsilon) {
    normal = Vec2{delta.x / distance, delta.y / distance};
  }
  penetration = min_distance - distance;
  return true;
}

bool box_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  const BoxAxes a_axes = box_axes(a.heading_deg);
  const BoxAxes b_axes = box_axes(b.heading_deg);
  const std::array<Vec2, 4> axes{a_axes.forward, a_axes.right, b_axes.forward, b_axes.right};
  const Vec2 center_delta{b.position.x - a.position.x, b.position.y - a.position.y};

  bool found_axis = false;
  double min_overlap = 0.0;
  Vec2 min_axis{1.0, 0.0};

  for (Vec2 axis : axes) {
    const double distance = std::abs(dot(center_delta, axis));
    const double overlap = box_projection_radius(a, a_axes, axis) +
                           box_projection_radius(b, b_axes, axis) -
                           distance;
    if (overlap <= 0.0) {
      return false;
    }
    if (!found_axis || overlap < min_overlap) {
      found_axis = true;
      min_overlap = overlap;
      min_axis = axis;
    }
  }

  if (dot(center_delta, min_axis) < 0.0) {
    min_axis = scaled(min_axis, -1.0);
  }
  normal = min_axis;
  penetration = min_overlap;
  return true;
}

bool box_circle_overlap(
  const PhysicsBody& box,
  Vec2 circle_center,
  double circle_radius,
  Vec2& normal,
  double& penetration
) {
  const BoxAxes axes = box_axes(box.heading_deg);
  const double half_length = box.shape.length_m * 0.5;
  const double half_width = box.shape.width_m * 0.5;
  const Vec2 center_delta{
    circle_center.x - box.position.x,
    circle_center.y - box.position.y,
  };
  const Vec2 local_circle{
    dot(center_delta, axes.forward),
    dot(center_delta, axes.right),
  };
  const Vec2 closest_local{
    clamp(local_circle.x, -half_length, half_length),
    clamp(local_circle.y, -half_width, half_width),
  };
  const Vec2 local_delta{
    local_circle.x - closest_local.x,
    local_circle.y - closest_local.y,
  };
  const double distance = length(local_delta);

  if (distance > kPositionEpsilon) {
    if (distance >= circle_radius) {
      return false;
    }
    const Vec2 local_normal{
      -local_delta.x / distance,
      -local_delta.y / distance,
    };
    normal = world_from_box_local(local_normal, axes);
    penetration = circle_radius - distance;
    return true;
  }

  const double left_clearance = local_circle.x + half_length;
  const double right_clearance = half_length - local_circle.x;
  const double bottom_clearance = local_circle.y + half_width;
  const double top_clearance = half_width - local_circle.y;

  double min_clearance = left_clearance;
  Vec2 local_normal{1.0, 0.0};
  if (right_clearance < min_clearance) {
    min_clearance = right_clearance;
    local_normal = Vec2{-1.0, 0.0};
  }
  if (bottom_clearance < min_clearance) {
    min_clearance = bottom_clearance;
    local_normal = Vec2{0.0, 1.0};
  }
  if (top_clearance < min_clearance) {
    min_clearance = top_clearance;
    local_normal = Vec2{0.0, -1.0};
  }

  normal = world_from_box_local(local_normal, axes);
  penetration = circle_radius + min_clearance;
  return true;
}

bool body_overlap(const PhysicsBody& a, const PhysicsBody& b, Vec2& normal, double& penetration) {
  if (has_box_shape(a) && has_box_shape(b)) {
    return box_overlap(a, b, normal, penetration);
  }
  return circle_overlap(a, b, normal, penetration);
}

void resolve_obstacles(
  Tick tick,
  const std::vector<StaticObstacle>& obstacles,
  const BattleBounds& bounds,
  PhysicsBody& body,
  std::vector<Event>& events
) {
  for (const auto& obstacle : obstacles) {
    if (!obstacle.blocks_movement) {
      continue;
    }

    Vec2 normal{-1.0, 0.0};
    double overlap = 0.0;
    if (has_box_shape(body)) {
      if (!box_circle_overlap(body, obstacle.position, obstacle.radius_m, normal, overlap)) {
        continue;
      }
    } else {
      const Vec2 delta{
        body.position.x - obstacle.position.x,
        body.position.y - obstacle.position.y,
      };
      const double distance = length(delta);
      const double min_distance = body.shape.radius_m + obstacle.radius_m;
      if (distance >= min_distance) {
        continue;
      }

      if (distance > kPositionEpsilon) {
        normal = Vec2{delta.x / distance, delta.y / distance};
      }
      overlap = min_distance - distance;
    }

    if (overlap <= 0.0) {
      continue;
    }

    body.position = Vec2{
      body.position.x + normal.x * overlap,
      body.position.y + normal.y * overlap,
    };
    events.push_back(Event{
      .tick = tick,
      .unit_id = body.unit_id,
      .code = "obstacle_collision",
      .message = "Collided with obstacle " + obstacle.id + ".",
      .payload = EventPayload{},
    });
  }

  body.position = clamp_body_to_bounds(body, bounds);
}

#if ROBOLOCKS_USE_JOLT
namespace jolt_layers {
constexpr JPH::ObjectLayer kNonMoving = 0;
constexpr JPH::ObjectLayer kMoving = 1;
constexpr JPH::ObjectLayer kLayerCount = 2;

namespace broad_phase {
constexpr JPH::BroadPhaseLayer kNonMoving(0);
constexpr JPH::BroadPhaseLayer kMoving(1);
constexpr JPH::uint kLayerCount = 2;
}  // namespace broad_phase
}  // namespace jolt_layers

class BroadPhaseLayerInterface final : public JPH::BroadPhaseLayerInterface {
 public:
  BroadPhaseLayerInterface() {
    object_to_broad_phase_[jolt_layers::kNonMoving] = jolt_layers::broad_phase::kNonMoving;
    object_to_broad_phase_[jolt_layers::kMoving] = jolt_layers::broad_phase::kMoving;
  }

  JPH::uint GetNumBroadPhaseLayers() const override {
    return jolt_layers::broad_phase::kLayerCount;
  }

  JPH::BroadPhaseLayer GetBroadPhaseLayer(JPH::ObjectLayer layer) const override {
    return object_to_broad_phase_[layer];
  }

#if defined(JPH_EXTERNAL_PROFILE) || defined(JPH_PROFILE_ENABLED)
  const char* GetBroadPhaseLayerName(JPH::BroadPhaseLayer layer) const override {
    switch (static_cast<JPH::BroadPhaseLayer::Type>(layer)) {
      case static_cast<JPH::BroadPhaseLayer::Type>(jolt_layers::broad_phase::kNonMoving):
        return "non_moving";
      case static_cast<JPH::BroadPhaseLayer::Type>(jolt_layers::broad_phase::kMoving):
        return "moving";
      default:
        return "unknown";
    }
  }
#endif

 private:
  JPH::BroadPhaseLayer object_to_broad_phase_[jolt_layers::kLayerCount];
};

class ObjectVsBroadPhaseLayerFilter final : public JPH::ObjectVsBroadPhaseLayerFilter {
 public:
  bool ShouldCollide(JPH::ObjectLayer object_layer, JPH::BroadPhaseLayer broad_phase_layer) const override {
    if (object_layer == jolt_layers::kMoving) {
      return broad_phase_layer == jolt_layers::broad_phase::kMoving ||
             broad_phase_layer == jolt_layers::broad_phase::kNonMoving;
    }
    return broad_phase_layer == jolt_layers::broad_phase::kMoving;
  }
};

class ObjectLayerPairFilter final : public JPH::ObjectLayerPairFilter {
 public:
  bool ShouldCollide(JPH::ObjectLayer a, JPH::ObjectLayer b) const override {
    if (a == jolt_layers::kNonMoving && b == jolt_layers::kNonMoving) {
      return false;
    }
    return true;
  }
};

void initialize_jolt_once() {
  static std::once_flag once;
  std::call_once(once, [] {
    JPH::RegisterDefaultAllocator();
    JPH::Factory::sInstance = new JPH::Factory();
    JPH::RegisterTypes();
  });
}

JPH::Vec3 to_jolt_position(Vec2 position, float half_height) {
  return JPH::Vec3(
    static_cast<float>(position.x),
    half_height,
    static_cast<float>(position.y)
  );
}

JPH::Quat yaw_rotation(double heading_deg) {
  return JPH::Quat::sRotation(
    JPH::Vec3::sAxisY(),
    static_cast<float>(-normalize_angle_deg(heading_deg) * kPi / 180.0)
  );
}

JPH::RefConst<JPH::Shape> body_shape(const PhysicsBody& body) {
  constexpr float kBodyHalfHeight = 0.6F;
  if (has_box_shape(body)) {
    return new JPH::BoxShape(JPH::Vec3(
      static_cast<float>(body.shape.length_m * 0.5),
      kBodyHalfHeight,
      static_cast<float>(body.shape.width_m * 0.5)
    ));
  }

  return new JPH::CylinderShape(kBodyHalfHeight, static_cast<float>(body.shape.radius_m));
}

JPH::RefConst<JPH::Shape> obstacle_shape(const StaticObstacle& obstacle) {
  return new JPH::CylinderShape(0.75F, static_cast<float>(obstacle.radius_m));
}

std::vector<Event> jolt_resolve(
  Tick tick,
  const BattleBounds& bounds,
  const std::vector<StaticObstacle>& obstacles,
  std::vector<PhysicsBody>& bodies
) {
  initialize_jolt_once();

  BroadPhaseLayerInterface broad_phase_layer_interface;
  ObjectVsBroadPhaseLayerFilter object_vs_broad_phase_layer_filter;
  ObjectLayerPairFilter object_layer_pair_filter;
  JPH::PhysicsSystem physics;
  physics.Init(
    1024,
    0,
    1024,
    1024,
    broad_phase_layer_interface,
    object_vs_broad_phase_layer_filter,
    object_layer_pair_filter
  );
  auto settings = physics.GetPhysicsSettings();
  settings.mBaumgarte = 1.0F;
  settings.mPenetrationSlop = 0.0F;
  settings.mMaxPenetrationDistance = 10.0F;
  settings.mNumPositionSteps = 12;
  settings.mAllowSleeping = false;
  physics.SetPhysicsSettings(settings);
  physics.SetGravity(JPH::Vec3::sZero());

  JPH::BodyInterface& body_interface = physics.GetBodyInterface();
  std::vector<JPH::BodyID> unit_body_ids;
  unit_body_ids.reserve(bodies.size());

  for (const auto& obstacle : obstacles) {
    if (!obstacle.blocks_movement) {
      continue;
    }
    JPH::BodyCreationSettings settings(
      obstacle_shape(obstacle),
      to_jolt_position(obstacle.position, 0.75F),
      JPH::Quat::sIdentity(),
      JPH::EMotionType::Static,
      jolt_layers::kNonMoving
    );
    const JPH::BodyID body_id = body_interface.CreateAndAddBody(settings, JPH::EActivation::DontActivate);
    (void)body_id;
  }

  for (const auto& body : bodies) {
    JPH::BodyCreationSettings settings(
      body_shape(body),
      to_jolt_position(body.position, 0.6F),
      yaw_rotation(body.heading_deg),
      JPH::EMotionType::Dynamic,
      jolt_layers::kMoving
    );
    settings.mFriction = 0.8F;
    settings.mRestitution = 0.0F;
    settings.mAllowSleeping = false;
    settings.mOverrideMassProperties = JPH::EOverrideMassProperties::CalculateInertia;
    settings.mMassPropertiesOverride.mMass = static_cast<float>(std::max(body.mass_kg, kMinCollisionMassKg));
    const JPH::BodyID body_id = body_interface.CreateAndAddBody(settings, JPH::EActivation::Activate);
    unit_body_ids.push_back(body_id);
  }

  physics.OptimizeBroadPhase();

  std::vector<Event> events;
  for (std::size_t i = 0; i < bodies.size(); i += 1) {
    for (std::size_t j = i + 1; j < bodies.size(); j += 1) {
      Vec2 normal{1.0, 0.0};
      double penetration = 0.0;
      if (!body_overlap(bodies[i], bodies[j], normal, penetration)) {
        continue;
      }
      events.push_back(Event{
        .tick = tick,
        .unit_id = bodies[i].unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(bodies[j].unit_id.value) + ".",
        .payload = EventPayload{},
      });
      events.push_back(Event{
        .tick = tick,
        .unit_id = bodies[j].unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(bodies[i].unit_id.value) + ".",
        .payload = EventPayload{},
      });
    }
  }

  JPH::TempAllocatorImpl temp_allocator(10 * 1024 * 1024);
  JPH::JobSystemSingleThreaded job_system(2048);
  for (int i = 0; i < 60; i += 1) {
    physics.Update(1.0F / 60.0F, 1, &temp_allocator, &job_system);
  }

  for (std::size_t i = 0; i < bodies.size(); i += 1) {
    const JPH::Vec3 position = body_interface.GetPosition(unit_body_ids[i]);
    bodies[i].position = Vec2{position.GetX(), position.GetZ()};
    resolve_obstacles(tick, obstacles, bounds, bodies[i], events);
  }

  return events;
}
#endif

}  // namespace

PhysicsSystem::PhysicsSystem(BattleBounds bounds, std::vector<StaticObstacle> obstacles)
    : bounds_(bounds), obstacles_(std::move(obstacles)) {}

std::string PhysicsSystem::backend_name() const {
#if ROBOLOCKS_USE_JOLT
  return "jolt";
#else
  return "legacy_2d";
#endif
}

bool PhysicsSystem::uses_3d_backend() const {
#if ROBOLOCKS_USE_JOLT
  return true;
#else
  return false;
#endif
}

std::vector<Event> PhysicsSystem::resolve(Tick tick, std::vector<PhysicsBody>& bodies) const {
#if ROBOLOCKS_USE_JOLT
  return jolt_resolve(tick, bounds_, obstacles_, bodies);
#else
  std::vector<Event> events;

  for (auto& body : bodies) {
    resolve_obstacles(tick, obstacles_, bounds_, body, events);
  }

  for (std::size_t i = 0; i < bodies.size(); i += 1) {
    for (std::size_t j = i + 1; j < bodies.size(); j += 1) {
      auto& a = bodies[i];
      auto& b = bodies[j];
      Vec2 normal{1.0, 0.0};
      double penetration = 0.0;
      if (!body_overlap(a, b, normal, penetration)) {
        continue;
      }

      const double a_mass = std::max(a.mass_kg, kMinCollisionMassKg);
      const double b_mass = std::max(b.mass_kg, kMinCollisionMassKg);
      const double a_inverse_mass = 1.0 / a_mass;
      const double b_inverse_mass = 1.0 / b_mass;
      const double inverse_mass_sum = a_inverse_mass + b_inverse_mass;
      const double a_share = inverse_mass_sum > 0.0 ? a_inverse_mass / inverse_mass_sum : 0.5;
      const double b_share = inverse_mass_sum > 0.0 ? b_inverse_mass / inverse_mass_sum : 0.5;

      a.position = Vec2{
        a.position.x - normal.x * penetration * a_share,
        a.position.y - normal.y * penetration * a_share,
      };
      b.position = Vec2{
        b.position.x + normal.x * penetration * b_share,
        b.position.y + normal.y * penetration * b_share,
      };
      a.position = clamp_body_to_bounds(a, bounds_);
      b.position = clamp_body_to_bounds(b, bounds_);

      events.push_back(Event{
        .tick = tick,
        .unit_id = a.unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(b.unit_id.value) + ".",
        .payload = EventPayload{},
      });
      events.push_back(Event{
        .tick = tick,
        .unit_id = b.unit_id,
        .code = "unit_collision",
        .message = "Collided with unit " + std::to_string(a.unit_id.value) + ".",
        .payload = EventPayload{},
      });
    }
  }

  return events;
#endif
}

}  // namespace robolocks
