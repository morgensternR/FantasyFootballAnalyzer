export interface InjuryOutlookProfile {
  name: string;
  typicalRecovery: string;
  recurrence: string;
  concern: string;
  sourceUrls: string[];
}

const SOURCES = {
  hamstring: [
    'https://my.clevelandclinic.org/health/diseases/17039-hamstring-injury',
    'https://www.sportsmed.org/membership/sports-medicine-update/summer-2026/the-hamstring-hold-up-a-look-into-professional-soccers-most-common-injury',
  ],
  ankle: ['https://www.orthoinfo.org/en/diseases--conditions/sprained-ankle'],
  groin: ['https://my.clevelandclinic.org/health/diseases/groin-strain'],
  mcl: ['https://my.clevelandclinic.org/health/diseases/21979-mcl-tear'],
  acl: ['https://www.sportsmed.org/the-injured-acl'],
  concussion: [
    'https://www.cdc.gov/traumatic-brain-injury/response/index.html',
    'https://www.cdc.gov/heads-up/guidelines/returning-to-sports.html',
  ],
  shoulder: ['https://my.clevelandclinic.org/health/diseases/shoulder-sprains'],
  turfToe: ['https://my.clevelandclinic.org/health/diseases/17590-turf-toe'],
  back: ['https://my.clevelandclinic.org/health/diseases/10265-back-strains-and-sprains'],
};

function haystack(bodyPart?: string, notes?: string, status?: string): string {
  return `${bodyPart ?? ''} ${notes ?? ''} ${status ?? ''}`.toLowerCase();
}

/**
 * General sports-medicine context only. This deliberately refuses to infer a
 * specific diagnosis from a broad Sleeper body-part label such as "knee".
 * Player/team medical reporting should supersede this generic profile when a
 * diagnosis or grade is known.
 */
export function injuryOutlook(
  bodyPart?: string,
  notes?: string,
  status?: string,
): InjuryOutlookProfile | null {
  const text = haystack(bodyPart, notes, status);
  if (!text.trim()) return null;

  if (text.includes('acl') || text.includes('anterior cruciate')) {
    return {
      name: 'ACL injury / reconstruction',
      typicalRecovery: 'Return to sport after ACL reconstruction is generally not considered for at least 6–9 months and may take longer.',
      recurrence: 'Meaningful reinjury and opposite-knee ACL risk remains after return; clearance is criteria-based, not just time-based.',
      concern: 'Major long-term availability concern; exact outlook depends on surgery date, graft, rehab and functional testing.',
      sourceUrls: SOURCES.acl,
    };
  }

  if (text.includes('mcl') || text.includes('medial collateral')) {
    return {
      name: 'MCL sprain/tear',
      typicalRecovery: 'Typical healing: grade 1 about 1–3 weeks, grade 2 about 4–6 weeks, grade 3 6+ weeks; combined knee injuries can take longer.',
      recurrence: 'A prior MCL tear increases future MCL injury risk, although isolated MCL injuries usually heal well with treatment.',
      concern: 'Moderate to major depending on grade and whether other knee structures are involved.',
      sourceUrls: SOURCES.mcl,
    };
  }

  if (text.includes('concussion') || text.includes('head injury') || text.includes('head')) {
    return {
      name: 'Concussion / head injury',
      typicalRecovery: 'Many mild concussions improve within days to a few weeks, but return to collision sport requires a symptom-guided multi-step progression and medical clearance.',
      recurrence: 'Repeat concussion risk is higher if an athlete returns before full recovery; prior concussions can also be associated with slower recovery.',
      concern: 'Highly individual and symptom-dependent; do not treat a generic timeline as a projected return date.',
      sourceUrls: SOURCES.concussion,
    };
  }

  if (text.includes('hamstring')) {
    return {
      name: 'Hamstring strain/injury',
      typicalRecovery: 'Grade 1 may improve in under a week; more significant strains can require several weeks and severe tears can take months. Elite-athlete return varies substantially by severity/location.',
      recurrence: 'Previous hamstring injury is a major recurrence risk factor; recurrent injuries often cluster early after return, so workload progression matters.',
      concern: 'High recurrence sensitivity for sprinting/cutting players even after they are cleared.',
      sourceUrls: SOURCES.hamstring,
    };
  }

  if (text.includes('high ankle') || text.includes('syndesm')) {
    return {
      name: 'High ankle / syndesmotic injury',
      typicalRecovery: 'Often slower than a routine lateral ankle sprain; exact return depends heavily on instability and associated injury, so a diagnosis-specific team timeline is needed.',
      recurrence: 'Incomplete healing or rehabilitation can leave instability and increase repeat-injury risk.',
      concern: 'Meaningful cutting/explosiveness concern; do not use the routine ankle-sprain range as a firm estimate.',
      sourceUrls: SOURCES.ankle,
    };
  }

  if (text.includes('ankle')) {
    return {
      name: 'Ankle sprain/injury',
      typicalRecovery: 'AAOS describes roughly 2 weeks for minor sprains and about 6–12 weeks for more severe sprains, with associated injuries potentially extending recovery.',
      recurrence: 'A previous ankle sprain raises repeat-sprain risk; incomplete rehabilitation is a common cause of chronic instability.',
      concern: 'Cutting and change-of-direction can remain limited after straight-line activity returns.',
      sourceUrls: SOURCES.ankle,
    };
  }

  if (text.includes('groin') || text.includes('adductor')) {
    return {
      name: 'Groin/adductor strain',
      typicalRecovery: 'Mild to moderate groin strains commonly require about 1–2 months for full healing; severe or chronic strains can take several months.',
      recurrence: 'Repeated strain of the same tissue can become chronic; premature return increases concern for persistent weakness/pain.',
      concern: 'Acceleration, cutting and lateral movement may be affected even when basic activity is possible.',
      sourceUrls: SOURCES.groin,
    };
  }

  if (text.includes('turf toe') || (text.includes('toe') && text.includes('sprain'))) {
    return {
      name: 'Turf toe / big-toe sprain',
      typicalRecovery: 'Typical ranges: grade 1 about 1 week, grade 2 about 2–3 weeks, grade 3 about 2–6 months.',
      recurrence: 'Persistent stiffness, weakness or pain can linger after more severe injuries; adequate support and healing matter for push-off.',
      concern: 'Can materially affect acceleration and cutting because the big toe is loaded during push-off.',
      sourceUrls: SOURCES.turfToe,
    };
  }

  if (text.includes('shoulder')) {
    return {
      name: 'Shoulder sprain/injury',
      typicalRecovery: 'A typical shoulder sprain may take a few weeks; severe grade-3 injuries can take a few months.',
      recurrence: 'A prior moderate/severe shoulder sprain can make future injury more likely, especially if stressed before full healing.',
      concern: 'For ball carriers/receivers, contact tolerance and range of motion can matter even after practice resumes.',
      sourceUrls: SOURCES.shoulder,
    };
  }

  if (text.includes('back') || text.includes('lumbar')) {
    return {
      name: 'Back strain/sprain',
      typicalRecovery: 'Many uncomplicated back strains/sprains improve in about 2 weeks; persistent or recurrent symptoms require a more specific diagnosis.',
      recurrence: 'Recurrent back symptoms can be load-sensitive; a generic "back" label does not distinguish muscle strain from disc/nerve problems.',
      concern: 'Broad label — confidence is low until the team reports the diagnosis and functional status.',
      sourceUrls: SOURCES.back,
    };
  }

  if (text.includes('knee')) {
    return {
      name: 'Knee injury — diagnosis unspecified',
      typicalRecovery: 'No responsible healing-time estimate can be made from "knee" alone: soreness/contusion may be short-term, while meniscus or ligament injuries can take weeks to months.',
      recurrence: 'Recurrence risk depends on the actual structure injured and prior history.',
      concern: 'Treat as uncertain until a diagnosis/grade or reliable return-to-play report is available.',
      sourceUrls: [SOURCES.mcl[0], SOURCES.acl[0]],
    };
  }

  if (text.includes('foot') || text.includes('toe')) {
    return {
      name: 'Foot/toe injury — diagnosis unspecified',
      typicalRecovery: 'The body-part label is too broad for a useful return estimate; bruises, sprains, fractures and plantar injuries have very different timelines.',
      recurrence: 'Risk depends on the diagnosed tissue and whether push-off/cutting is pain-free after rehabilitation.',
      concern: 'Need diagnosis or team return timeline before applying a fantasy-specific duration estimate.',
      sourceUrls: SOURCES.turfToe,
    };
  }

  return {
    name: `${bodyPart || 'Injury'} — diagnosis unspecified`,
    typicalRecovery: 'No reliable healing-time estimate is available from the current Sleeper label alone.',
    recurrence: 'Recurrence risk cannot be estimated responsibly without the diagnosis, grade and prior-injury history.',
    concern: 'Use current practice participation and team/medical reporting until a more specific diagnosis is available.',
    sourceUrls: [],
  };
}
