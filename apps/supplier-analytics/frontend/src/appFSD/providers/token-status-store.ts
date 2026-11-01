export type TokenStatusReason = "expired" | "unauthorized"

export type TokenStatusState = {
    invalid: boolean
    reason: TokenStatusReason | null
}

const INITIAL_STATE: TokenStatusState = { invalid: false, reason: null }

let state: TokenStatusState = INITIAL_STATE
const listeners = new Set<() => void>()

function emit() {
    for (const listener of listeners) listener()
}

export function subscribeTokenStatus(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function getTokenStatusSnapshot(): TokenStatusState {
    return state
}

export function markTokenInvalid(reason: TokenStatusReason) {
    state = { invalid: true, reason }
    emit()
}

export function clearTokenInvalid() {
    if (!state.invalid) return
    state = INITIAL_STATE
    emit()
}
