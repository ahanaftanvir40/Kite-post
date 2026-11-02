export interface Country {
  code: string;
  name: string;
  /** University email domains end with this. Also used as `site:` when searching. */
  suffix: string;
  /** Official scholarship portal for international students, only where the link was checked. */
  scholarship?: { name: string; url: string };
}

export const COUNTRIES: Country[] = [
  { code: "uk", name: "United Kingdom", suffix: "ac.uk", scholarship: { name: "Commonwealth Scholarships (CSC)", url: "https://cscuk.fcdo.gov.uk" } },
  { code: "de", name: "Germany", suffix: "de", scholarship: { name: "DAAD scholarships", url: "https://www.daad.de/en/study-and-research-in-germany/scholarships/" } },
  { code: "us", name: "United States", suffix: "edu", scholarship: { name: "Fulbright foreign student program", url: "https://foreign.fulbrightonline.org" } },
  { code: "ca", name: "Canada", suffix: "ca", scholarship: { name: "Vanier Canada Graduate Scholarships", url: "https://vanier.gc.ca" } },
  { code: "au", name: "Australia", suffix: "edu.au", scholarship: { name: "Australia Awards", url: "https://www.australiaawards.gov.au" } },
  { code: "nl", name: "Netherlands", suffix: "nl", scholarship: { name: "Holland Scholarship", url: "https://www.studyinholland.nl/finances/holland-scholarship" } },
  { code: "se", name: "Sweden", suffix: "se", scholarship: { name: "Swedish Institute scholarships", url: "https://si.se/en/apply/scholarships/" } },
  { code: "ch", name: "Switzerland", suffix: "ch", scholarship: { name: "Swiss Government Excellence Scholarships", url: "https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html" } },
  { code: "fi", name: "Finland", suffix: "fi", scholarship: { name: "Study in Finland scholarships", url: "https://www.studyinfinland.fi/scholarships" } },
  { code: "dk", name: "Denmark", suffix: "dk", scholarship: { name: "Study in Denmark: fees and scholarships", url: "https://studyindenmark.dk/study-options/tuition-fees-and-scholarships" } },
  { code: "no", name: "Norway", suffix: "no", scholarship: { name: "Study in Norway", url: "https://www.studyinnorway.no" } },
  { code: "ie", name: "Ireland", suffix: "ie", scholarship: { name: "Study in Ireland", url: "https://www.studyinireland.ie" } },
  { code: "fr", name: "France", suffix: "fr", scholarship: { name: "Eiffel Excellence Scholarship", url: "https://www.campusfrance.org/en/eiffel-scholarship-program-of-excellence" } },
  { code: "at", name: "Austria", suffix: "at", scholarship: { name: "OeAD scholarships", url: "https://www.oead.at/en" } },
  { code: "be", name: "Belgium", suffix: "be", scholarship: { name: "Study in Flanders scholarships", url: "https://www.studyinflanders.be/scholarships" } },
  { code: "hu", name: "Hungary", suffix: "hu", scholarship: { name: "Stipendium Hungaricum", url: "https://stipendiumhungaricum.hu" } },
  { code: "tr", name: "Türkiye", suffix: "edu.tr", scholarship: { name: "Türkiye Scholarships", url: "https://www.turkiyeburslari.gov.tr" } },
  { code: "nz", name: "New Zealand", suffix: "ac.nz", scholarship: { name: "New Zealand Scholarships", url: "https://www.nzscholarships.govt.nz" } },
  { code: "jp", name: "Japan", suffix: "ac.jp", scholarship: { name: "Study in Japan: scholarships", url: "https://www.studyinjapan.go.jp/en/planning/scholarships/" } },
  { code: "kr", name: "South Korea", suffix: "ac.kr", scholarship: { name: "Study in Korea (GKS)", url: "https://www.studyinkorea.go.kr" } },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Scholarship and position sources that work across countries. */
export const GENERAL_RESOURCES: { name: string; url: string; note: string }[] = [
  { name: "Erasmus Mundus Joint Master's", url: "https://erasmus-plus.ec.europa.eu/opportunities/opportunities-for-individuals/students/erasmus-mundus-joint-masters", note: "Fully funded Master's across several European universities" },
  { name: "EURAXESS", url: "https://euraxess.ec.europa.eu", note: "Research jobs, PhD positions and funding in Europe" },
  { name: "jobs.ac.uk", url: "https://www.jobs.ac.uk", note: "PhD studentships and academic posts, mostly UK" },
  { name: "Gates Cambridge", url: "https://www.gatescambridge.org", note: "Full-cost scholarships for postgraduates at Cambridge" },
  { name: "Rhodes Scholarship", url: "https://www.rhodeshouse.ox.ac.uk/scholarships/the-rhodes-scholarship", note: "Postgraduate study at Oxford" },
];
