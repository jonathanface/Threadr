package models

// CurrentTermsVersion is the ToS/Privacy Policy version that newly created
// users are recorded as accepting. Bump this string whenever the contents of
// /terms.html or /privacy.html materially change; downstream code can then
// compare it against UserInfo.TermsVersion to decide whether to re-prompt
// existing users for fresh acceptance.
const CurrentTermsVersion = "v1"
