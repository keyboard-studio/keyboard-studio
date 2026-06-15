// Phase A sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly — this file is the Phase A
// sub-registry. The main registry.ts will be consolidated by the team lead
// after all parallel agents return.
//
// One import + one entry per question module. Key MUST match definition.id exactly.

import type { QuestionModule } from "../types.ts";

import desktop_first_notice from "./a/desktop_first_notice.ts";
import language_name_autonym from "./a/language_name_autonym.ts";
import language_name_english from "./a/language_name_english.ts";
import iso_code from "./a/iso_code.ts";
import region from "./a/region.ts";
import primary_script from "./a/primary_script.ts";
import writing_direction from "./a/writing_direction.ts";
import script_not_supported_stub from "./a/script_not_supported_stub.ts";
import layout_family from "./a/layout_family.ts";
import script_family from "./a/script_family.ts";
import pa_primary_target from "./a/pa_primary_target.ts";
import author_display_name from "./a/author_display_name.ts";
import author_contact_email from "./a/author_contact_email.ts";
import pa_copyright_holder from "./a/pa_copyright_holder.ts";
import provenance_opt_in from "./a/provenance_opt_in.ts";
import provenance_requester_name from "./a/provenance_requester_name.ts";
import provenance_requester_contact from "./a/provenance_requester_contact.ts";
import provenance_requester_affiliation from "./a/provenance_requester_affiliation.ts";
import provenance_requester_relation from "./a/provenance_requester_relation.ts";
import provenance_community_rep_name from "./a/provenance_community_rep_name.ts";
import provenance_community_rep_role from "./a/provenance_community_rep_role.ts";
import provenance_community_rep_email from "./a/provenance_community_rep_email.ts";
import provenance_speaker_count from "./a/provenance_speaker_count.ts";
import provenance_regions from "./a/provenance_regions.ts";
import provenance_language_status from "./a/provenance_language_status.ts";
import provenance_existing_tools from "./a/provenance_existing_tools.ts";
import provenance_orthography_url from "./a/provenance_orthography_url.ts";
import provenance_community_involvement from "./a/provenance_community_involvement.ts";
import provenance_casing_notes from "./a/provenance_casing_notes.ts";
import provenance_additional_notes from "./a/provenance_additional_notes.ts";

/**
 * Synchronous Phase A question registry.
 * Consumed by the consolidated registry.ts once the team lead merges all
 * per-phase sub-registries.
 */
export const phaseARegistry: Readonly<Record<string, QuestionModule>> = {
  desktop_first_notice,
  language_name_autonym,
  language_name_english,
  iso_code,
  region,
  primary_script,
  writing_direction,
  script_not_supported_stub,
  layout_family,
  script_family,
  pa_primary_target,
  author_display_name,
  author_contact_email,
  pa_copyright_holder,
  provenance_opt_in,
  provenance_requester_name,
  provenance_requester_contact,
  provenance_requester_affiliation,
  provenance_requester_relation,
  provenance_community_rep_name,
  provenance_community_rep_role,
  provenance_community_rep_email,
  provenance_speaker_count,
  provenance_regions,
  provenance_language_status,
  provenance_existing_tools,
  provenance_orthography_url,
  provenance_community_involvement,
  provenance_casing_notes,
  provenance_additional_notes,
} as const;
