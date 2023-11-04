package models

func (a *AwsError) IsNil() bool {
	if a.Code == "" && a.Text == "" {
		return true
	}
	return false
}

type AwsError struct {
	Code      string `json:"code"`
	ErrorType string `json:"error_type"`
	Text      string `json:"text"`
}
