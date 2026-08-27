# Valid `group_code` values and the disease-group lookup

- **Question:** What are the valid `group_code` values for `GET /api/d506/v1/disease-groups`, and is there a companion lookup endpoint returning the list with Thai names?
- **Issue:** rawinan-soma/dds-sharing#3 (child of #1; blocks #7)
- **Date:** 2026-08-27
- **Primary source:** `docs/DDS_Envocc_080169.pdf` — *"การส่งรายงานการเฝ้าระวังโรคผ่านแพลตฟอร์มระบบเฝ้าระวังโรคดิจิทัล (Digital Disease Surveillance: DDS)"*, กลุ่มเฝ้าระวังและตอบโต้ภาวะฉุกเฉิน, กองโรคจากการประกอบอาชีพและสิ่งแวดล้อม (EnvOcc), กรมควบคุมโรค. Slide deck, 34 pages.

## Answer

`group_code` is the deck's **`รหัสรายงานโรค`** (disease report code) — confirmed by the repo owner against p.19.

There are **24 valid values, `201`–`224`, contiguous**, each mapping 1:1 to a primary ICD-10 code and carrying an official Thai and English disease name. They split into two provenance blocks:

- **201–215** — the codes established under พ.ร.บ.ควบคุมโรคจากการประกอบอาชีพและโรคสิ่งแวดล้อม พ.ศ. 2562. The deck heads these as *"ทั้งหมด 5 กลุ่มโรค จำนวน 15 รหัสโรค"* (p.19).
- **216–224** — *"การเพิ่มเติมรหัสโรค (ICD-10) ใหม่ ในระบบ DDS จำนวน 9 รหัส"* (p.24–25), added to DDS from ธ.ค. 2567 (p.15).

**No companion lookup endpoint is documented** — see below.

For the Request form: this list must be **seeded from this deck**, not fetched. Display the Thai name (`ชื่อโรคภาษาไทย`); the Requester never types `201`.

## The code list

### 201–215 — พ.ร.บ. EnvOcc 2562 (p.19–23)

| group_code | ICD-10 | ชื่อโรคภาษาไทย | English |
|---|---|---|---|
| 201 | Z581 | โรคที่เกิดจากการสัมผัสมลพิษทางอากาศ | Exposure to air pollution |
| 202 | J628 | โรคฝุ่นจับปอดจากฝุ่นอื่นที่มีซิลิกา | Pneumoconiosis due to other specified inorganic dusts |
| 203 | J65 | โรคฝุ่นจับปอดร่วมกับวัณโรค | Pneumoconiosis associated with tuberculosis |
| 204 | J61 | โรคฝุ่นจับปอดจากแร่ใยหินและเส้นใยแร่อื่น | Pneumoconiosis due to asbestos and other mineral fibres |
| 205 | J920 | เยื่อหุ้มปอดหนาเป็นแผ่นร่วมกับมีแร่ใยหิน | Pleural plaque with presence of asbestos |
| 206 | J948 | ภาวะอื่นที่ระบุรายละเอียดของเยื่อหุ้มปอด | Other specified pleural conditions |
| 207 | C450 | มีโซทิลิโอมาของเยื่อหุ้มปอด | Mesothelioma of pleura |
| 208 | T560 | โรคจากตะกั่วและสารประกอบ | Lead and its compounds toxic effect |
| 209 | X48.02 | …สถานที่เกิดเหตุที่บ้าน | …pesticides **at home** |
| 210 | X48.12 | …สถานที่พักอาศัยรวม เช่น หอพัก เรือนจ้า สถานสงเคราะห์ | …in a **residential facility** (dormitory, worker's quarters, shelter) |
| 211 | X48.22 | …โรงเรียน สถานที่อื่น และพื้นที่สาธารณะ เช่น หอประชุม โรงพยาบาล | …at a **school, other location, or public area** (hall, hospital) |
| 212 | X48.32 | …สนามกีฬาและพื้นที่เล่นกีฬา | …at a **sports field or recreational area** |
| 213 | X48.42 | …ถนนและทางหลวง | …on **roads and highways** |
| 214 | X48.52 | …พื้นที่การค้าและการบริการ เช่น สนามบิน ธนาคาร ตลาด | …in **commercial and service areas** (airports, banks, markets) |
| 215 | X48.62 | …พื้นที่อุตสาหกรรมและก่อสร้าง เช่น เหมือง อู่ต่อเรือ | …in **industrial and construction areas** (mines, shipyards) |

Codes 209–215 (and 216–218 below) share the Thai prefix `การเป็นพิษโดยอุบัติเหตุจากยาฆ่าศัตรูพืชและสัตว์ สถานที่เกิดเหตุที่…` and the suffix `ขณะทำงานเพื่อรายได้` — English: *"Accidental poisoning by and exposure to pesticides at …, while working for income."* Only the **location** distinguishes them. The `…` in the table stands in for that shared prefix.

### 216–224 — added in DDS (p.24–25)

| group_code | ICD-10 | ชื่อโรคภาษาไทย | English |
|---|---|---|---|
| 216 | X48.72 | …สถานที่เกิดเหตุที่ไร่นา | …pesticides **on farmland** |
| 217 | X48.82 | …สถานที่อื่นที่ระบุรายละเอียด เช่น ชายหาด เนินเขา สวนสัตว์ | …at **other specified locations** (beaches, hills, zoos) |
| 218 | X48.92 | …สถานที่ไม่ระบุรายละเอียด | …at an **unspecified location** |
| 219 | W81 | ถูกกักหรือติดอยู่ในสภาพแวดล้อมที่มีออกซิเจนต่ำ | Confined to or trapped in a low-oxygen environment |
| 220 | Y96 | ภาวะที่เกี่ยวกับการทำงาน | Work-related condition |
| 221 | Y97 | ภาวะที่เกี่ยวกับมลพิษในสิ่งแวดล้อม | Environmental-pollution-related condition |
| 222 | W88 | การสัมผัสรังสีที่แตกตัวเป็นไอออน | Exposure to ionizing radiation |
| 223 | Z57.1 | การสัมผัสรังสีจากการทำงาน | Occupational exposure to radiation |
| 224 | Z58.4 | การสัมผัสรังสี | Exposure to radiation |

### `รหัส ICD-10 ร่วม` (companion ICD-10 codes)

Recorded where the deck lists them; blank elsewhere.

- **201** — J44 Other chronic obstructive pulmonary disease; J45 Asthma; J442 Wheezing associated respiratory illness (WARI); I21 Acute myocardial infarction; I22 Subsequent myocardial infarction; I24 Other acute ischaemic heart diseases; H10 Conjunctivitis; L309 Dermatitis, unspecified; L50 Urticaria.
- **208** — Y96 Work-related condition **or** Y97 Environmental-pollution-related condition.
- **209–215** — T600 Organophosphate and carbamate insecticides; T601 Halogenated insecticides; T602 Other insecticides; T603 Herbicides and fungicides; T604 Rodenticides; T608 Other pesticides; T609 Pesticide, unspecified. *(Listed once spanning the 209/210 rows on p.21; read as applying to the pesticide block.)*

## Companion lookup endpoint

**Not found.** The deck documents no lookup endpoint for disease groups, and names no API path at all beyond the portal URL.

What the deck does establish about the API surface (p.16–18, 29–31):

- Data flows HIS → API → **D506 collection / Data Hub** → D506 analytics (p.16).
- Four submission paths: HIS API (HosXP v3/v4, HosXPXe, HosMy, HosPCU, JHCIS), **Semi-Offline API** (Excel batch upload, developed by กองระบาดวิทยา), **D506 Portal** key-in at `https://d506portal.ddc.moph.go.th`, and other-vendor APIs coordinated with กองระบาดวิทยา (p.17, 31).
- Authentication is **MoPH account** and/or **Provider ID (RBAC)** — no anonymous access (p.17, 29–30).
- The `epidem_report` payload carries **`epidem_report_group_id`** alongside `diagnosis_icd10` and `diagnosis_icd10_list` (p.18). This is the payload field the `group_code` enumeration most plausibly populates — **inference, not stated in the deck.**

Since every documented path is authenticated, an unauthenticated `GET /api/d506/v1/disease-groups` probe was not attempted.

## 43-แฟ้ม alignment

**Unconfirmed — and the deck gives positive reason to doubt it.** The deck never mentions 43-แฟ้ม. The codes are presented as a DDS/EnvOcc-specific `รหัสรายงานโรค` series in the 201–224 range, defined by ministerial announcement rather than by the MOPH standard-file structure. Treat any 43-แฟ้ม correspondence as an open question, not an assumption.

## Open questions & next steps

1. **Is `group_code` sent as the bare integer (`201`) or zero-padded/string?** The deck's tables show `201`. Confirm against a real payload or the data dictionary.
2. **Does `group_code` populate `epidem_report_group_id`?** Inferred from p.18. Confirm with กองระบาดวิทยา or a sample request.
3. **Lookup endpoint** — ask กองระบาดวิทยา directly (contact below) whether the catalogue exposes a disease-group lookup, or whether clients are expected to embed this list.
4. **43-แฟ้ม / `EPIDEMIC` file alignment** — check the สนย./ศทส. structure docs for the 506 `DISEASECODE` code set and compare.
5. **Form design (feeds #7):** 201–224 is not a usable flat dropdown — 209–218 are ten pesticide entries differing only by location. Group by disease family first (the deck's own 8-family breakdown on p.26–27: PM2.5, ซิลิโคสิส, แอสเบสโตสิส, สารกำจัดศัตรูพืช, ตะกั่ว, อับอากาศ, รังสีแตกตัว, รังสีก่อไอออน), then location.
6. **Versioning:** 216–224 were added ธ.ค. 2567; ประกาศกรมควบคุมโรค พ.ศ. 2568 took effect 2 ต.ค. 68. The list is amendable by announcement — do not treat it as frozen.

**Contact (from p.34):** กองโรคจากการประกอบอาชีพและสิ่งแวดล้อม — 02 590 3864, envocc4.0@gmail.com.

## Sources

| Source | What it gave |
|---|---|
| `docs/DDS_Envocc_080169.pdf` p.19–23 | `รหัสรายงานโรค` 201–215 with ICD-10, Thai and English names, companion ICD-10 codes |
| same, p.24–25 | `รหัสรายงานโรค` 216–224, the 9 codes added in DDS |
| same, p.18 | DDS data structure — `epidem_report.epidem_report_group_id`, `diagnosis_icd10`, `diagnosis_icd10_list` |
| same, p.26–27 | ICD-10 coding guidance by Principle Diagnosis / Comorbidity / External Cause across 8 disease families |
| same, p.16–17, 29–31 | Data flow, four submission paths, MoPH account + Provider ID (RBAC) auth, D506 Portal URL |
| same, p.5–11, 15 | Legal basis (พ.ร.บ. 2562, ประกาศ สธ. 2565, ประกาศ คร. 2568), DDS timeline, EnvOcc codes added ธ.ค. 2567 |
| same, p.34 | กองโรคจากการประกอบอาชีพและสิ่งแวดล้อม contact details |

No external/web sources were consulted; the deck is first-party DDC material and answered the question directly.
