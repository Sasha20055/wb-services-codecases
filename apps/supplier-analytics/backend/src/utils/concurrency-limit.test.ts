import { test, expect, describe } from "bun:test"
import { createSemaphore, ConcurrencyLimitError } from "./concurrency-limit"

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("createSemaphore — ограничитель параллелизма", () => {
  test("не пускает больше limit одновременно, остальные ждут", async () => {
    const sem = createSemaphore(2)
    let active = 0
    let maxActive = 0
    const gate = deferred()

    const task = () =>
      sem.run(async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await gate.promise
        active--
      })

    const all = [task(), task(), task(), task()]

    await new Promise((r) => setTimeout(r, 10))
    expect(sem.stats().active).toBe(2)
    expect(sem.stats().queued).toBe(2)
    expect(maxActive).toBe(2)

    gate.resolve()
    await Promise.all(all)
    expect(maxActive).toBe(2)
    expect(sem.stats().active).toBe(0)
    expect(sem.stats().queued).toBe(0)
  })

  test("ждущие пускаются по мере освобождения слотов (FIFO)", async () => {
    const sem = createSemaphore(1)
    const order: number[] = []
    const gates = [deferred(), deferred(), deferred()]

    const task = (i: number) =>
      sem.run(async () => {
        order.push(i)
        await gates[i].promise
      })

    const all = [task(0), task(1), task(2)]
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([0])

    gates[0].resolve()
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([0, 1])

    gates[1].resolve()
    await new Promise((r) => setTimeout(r, 10))
    expect(order).toEqual([0, 1, 2])

    gates[2].resolve()
    await Promise.all(all)
  })

  test("при переполнении очереди — ConcurrencyLimitError(overloaded)", async () => {
    const sem = createSemaphore(1, { maxQueue: 1 })
    const gate = deferred()
    const running = sem.run(async () => {
      await gate.promise
    })
    const queued = sem.run(async () => {})
    await new Promise((r) => setTimeout(r, 5))

    await expect(sem.run(async () => {})).rejects.toBeInstanceOf(ConcurrencyLimitError)

    gate.resolve()
    await running
    await queued
  })

  test("ожидание дольше acquireTimeoutMs — ConcurrencyLimitError(timeout)", async () => {
    const sem = createSemaphore(1, { acquireTimeoutMs: 20 })
    const gate = deferred()
    const running = sem.run(async () => {
      await gate.promise
    })

    const waiter = sem.run(async () => {})
    await expect(waiter).rejects.toMatchObject({ reason: "timeout" })

    gate.resolve()
    await running

    expect(sem.stats().queued).toBe(0)
  })

  test("слот освобождается даже если задача бросила исключение", async () => {
    const sem = createSemaphore(1)
    await expect(
      sem.run(async () => {
        throw new Error("boom")
      }),
    ).rejects.toThrow("boom")

    const ok = await sem.run(async () => "ok")
    expect(ok).toBe("ok")
    expect(sem.stats().active).toBe(0)
  })
})
