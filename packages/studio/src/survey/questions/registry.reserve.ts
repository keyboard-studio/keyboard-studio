// Reserve sub-registry.
//
// Fan-out rule: do NOT edit registry.ts directly â€” this file is the Reserve
// sub-registry. It holds the demoted (not deleted) question modules that no
// live flow uses: the 30 demoted Phase A modules (identity + provenance_*)
// plus pb_mark_input_order (relocated out of the live Phase B battery â€” spec
// 046). Kept for reference / future reuse; see content/flows/README.md's
// Leftover section.
//
// One import + one entry per question module. Key MUST match definition.id exactly.

import type { QuestionModule } from "../types.ts";
import type { DecisionId } from "../../decisions/decisionTypes.ts";
import { indexProviders } from "../../decisions/orderDecisions.ts";

import desktop_first_notice from "./reserve/desktop_first_notice.ts";
import language_name_autonym from "./reserve/language_name_autonym.ts";
import language_name_english from "./reserve/language_name_english.ts";
import iso_code from "./reserve/iso_code.ts";
import region from "./reserve/region.ts";
import primary_script from "./reserve/primary_script.ts";
import writing_direction from "./reserve/writing_direction.ts";
import script_not_supported_stub from "./reserve/script_not_supported_stub.ts";
import layout_family from "./reserve/layout_family.ts";
import script_family from "./reserve/script_family.ts";
import pa_primary_target from "./reserve/pa_primary_target.ts";
import author_display_name from "./reserve/author_display_name.ts";
import author_contact_email from "./reserve/author_contact_email.ts";
import pa_copyright_holder from "./reserve/pa_copyright_holder.ts";
import provenance_opt_in from "./reserve/provenance_opt_in.ts";
import provenance_requester_name from "./reserve/provenance_requester_name.ts";
import provenance_requester_contact from "./reserve/provenance_requester_contact.ts";
import provenance_requester_affiliation from "./reserve/provenance_requester_affiliation.ts";
import provenance_requester_relation from "./reserve/provenance_requester_relation.ts";
import provenance_community_rep_name from "./reserve/provenance_community_rep_name.ts";
import provenance_community_rep_role from "./reserve/provenance_community_rep_role.ts";
import provenance_community_rep_email from "./reserve/provenance_community_rep_email.ts";
import provenance_speaker_count from "./reserve/provenance_speaker_count.ts";
import provenance_regions from "./reserve/provenance_regions.ts";
import provenance_language_status from "./reserve/provenance_language_status.ts";
import provenance_existing_tools from "./reserve/provenance_existing_tools.ts";
import provenance_orthography_url from "./reserve/provenance_orthography_url.ts";
import provenance_community_involvement from "./reserve/provenance_community_involvement.ts";
import provenance_casing_notes from "./reserve/provenance_casing_notes.ts";
import provenance_additional_notes from "./reserve/provenance_additional_notes.ts";
import pb_mark_input_order from "./reserve/pb_mark_input_order.ts";

/**
 * The 30 demoted Phase A modules — the proposed phase_a_identity flow's module
 * set (spec 085 US4: its order derives from their provides/requires).
 *
 * KEY ORDER IS MEANINGFUL: it is the stable tie-break for `orderDecisions`
 * where the provides/requires graph is silent, so keep the keys in the
 * proposed walk sequence (decisions/orderParity.test.ts pins the result).
 * pb_mark_input_order is deliberately NOT here — it belongs to no flow.
 */
export const phaseAReserveRegistry: Readonly<Record<string, QuestionModule>> = {
  desktop_first_notice,
  language_name_english,
  language_name_autonym,
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

/**
 * Synchronous Reserve question registry.
 * Consumed by the consolidated registry.ts (merged in) and directly by
 * steps/flowSources.ts (the phase_a_identity proposed-flow entry) and the
 * Flow Map's Leftover section (dashboard/renderedNodeSet.ts).
 */
export const reserveRegistry: Readonly<Record<string, QuestionModule>> = {
  ...phaseAReserveRegistry,
  pb_mark_input_order,
} as const;

/**
 * Decision-id index over the reserve modules (spec 085 US4) — the modules' own
 * `provides` declarations through the canonical indexer, so a duplicate
 * provider throws. The reserve decisions use `reserve-*` ids, distinct from the
 * live il_* ids, so this registry never double-provides against registry.a.ts.
 */
export const reserveDecisionIndex: Readonly<
  Partial<Record<DecisionId, QuestionModule>>
> = Object.fromEntries(indexProviders(Object.values(reserveRegistry)));
