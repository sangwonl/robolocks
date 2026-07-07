execute_process(
  COMMAND "${ROBOLOCKS_CLI}" run --preset preset_duel_v0 --ticks 3 --stream-json
  RESULT_VARIABLE result
  OUTPUT_VARIABLE output
  ERROR_VARIABLE error
)

if(NOT result EQUAL 0)
  message(FATAL_ERROR "stream command failed with ${result}: ${error}")
endif()

string(STRIP "${output}" stripped_output)
string(REPLACE "\n" ";" lines "${stripped_output}")
list(LENGTH lines line_count)
if(NOT line_count EQUAL 4)
  message(FATAL_ERROR "expected 4 JSONL frames, got ${line_count}: ${output}")
endif()

list(GET lines 0 first_line)
string(JSON first_type GET "${first_line}" type)
string(JSON first_tick GET "${first_line}" frame tick)
if(NOT first_type STREQUAL "battleFrame")
  message(FATAL_ERROR "expected first frame to be battleFrame, got ${first_type}")
endif()
if(NOT first_tick EQUAL 0)
  message(FATAL_ERROR "expected first frame tick 0, got ${first_tick}")
endif()

list(GET lines 3 final_line)
string(JSON final_type GET "${final_line}" type)
string(JSON final_tick GET "${final_line}" frame tick)
if(NOT final_type STREQUAL "battleComplete")
  message(FATAL_ERROR "expected final frame to be battleComplete, got ${final_type}")
endif()
if(NOT final_tick EQUAL 3)
  message(FATAL_ERROR "expected final frame tick 3, got ${final_tick}")
endif()
