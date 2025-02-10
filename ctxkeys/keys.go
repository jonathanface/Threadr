package ctxkey

type ContextKey string

const (
	DAO         ContextKey = "dao"
	IsSuspended ContextKey = "isSuspended"
)
