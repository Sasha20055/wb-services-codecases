import * as React from "react"
import { useTaskPresence } from "@/src/appFSD/providers/live-updates-provider"

type TaskPresenceIndicatorProps = {
    taskId: string
    currentUserId?: string
    className?: string
}

export function TaskPresenceIndicator({ taskId, currentUserId, className }: TaskPresenceIndicatorProps) {
    const { getOtherTaskUsers } = useTaskPresence()
    const otherUsers = getOtherTaskUsers(taskId, currentUserId)

    const content = React.useMemo(() => {
        if (otherUsers.length === 0) return null

        const visibleNames = otherUsers.slice(0, 2).map((user) => user.userName)
        const hiddenCount = Math.max(0, otherUsers.length - visibleNames.length)
        const summary = hiddenCount > 0 ? `${visibleNames.join(", ")} +${hiddenCount}` : visibleNames.join(", ")

        return {
            summary,
            title: otherUsers.map((user) => user.userName).join(", "),
        }
    }, [otherUsers])

    if (!content) return null

    return (
        <div
            className={[
                "mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700",
                className,
            ]
                .filter(Boolean)
                .join(" ")}
            title={`Еще работают: ${content.title}`}
        >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
            <span className="truncate">Пользователи работают: {content.summary}</span>
        </div>
    )
}
