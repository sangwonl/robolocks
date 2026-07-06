#include <robolocks/version.hpp>

#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define ROBOLOCKS_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define ROBOLOCKS_EXPORT
#endif

extern "C" {

ROBOLOCKS_EXPORT const char* robolocks_engine_version() {
  static const std::string version = robolocks::engine_version();
  return version.c_str();
}

}
