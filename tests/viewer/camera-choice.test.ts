// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CameraChoice,
  cameraChoiceMarkup,
} from "../../apps/mirror/src/camera-choice";
const a = { id: "a".repeat(64), name: "USB Camera" };
const b = { id: "b".repeat(64), name: "USB Camera" };
const fetchMock = vi.fn();
let chooser: CameraChoice;
const select = () =>
  document.querySelector<HTMLSelectElement>("#camera-choice")!;
const status = () =>
  document.querySelector("#camera-choice-status")!.textContent;
function response(cameras: unknown) {
  return { ok: true, json: async () => ({ cameras }) };
}
beforeEach(() => {
  document.body.innerHTML = cameraChoiceMarkup;
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  chooser = new CameraChoice();
});
afterEach(() => {
  chooser.dispose();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
it("requires a choice among multiple cameras, distinguishes duplicate names and returns native identity", async () => {
  fetchMock.mockResolvedValue(response([a, b]));
  await chooser.refresh();
  expect(() => chooser.selection()).toThrow(/Choose a camera first/);
  expect([...select().options].map((item) => item.textContent)).toContain(
    "USB Camera · 2",
  );
  select().value = b.id;
  expect(chooser.selection()).toEqual({ cameraId: b.id });
});
it("preserves the selected identity across reordering, then clears an unplugged choice without substitution", async () => {
  fetchMock.mockResolvedValue(response([a, b]));
  await chooser.refresh();
  select().value = a.id;
  fetchMock.mockResolvedValue(response([b, a]));
  await chooser.refresh();
  expect(chooser.selection()).toEqual({ cameraId: a.id });
  fetchMock.mockResolvedValue(response([b]));
  await chooser.refresh();
  expect(select().value).toBe("");
  expect(status()).toMatch(/disconnected/);
  expect(() => chooser.selection()).toThrow();
});
it("shows useful empty and service-error states without choosing a manual fallback", async () => {
  fetchMock.mockResolvedValue(response([]));
  await chooser.refresh();
  expect(status()).toMatch(/No cameras detected/);
  expect(select().value).toBe("");
  fetchMock.mockRejectedValue(new Error("Service offline"));
  await chooser.refresh();
  expect(status()).toMatch(/Service offline.*Refresh/);
  expect(() => chooser.selection()).toThrow();
});
it("locks selection and refresh during capture and does not open a camera", async () => {
  fetchMock.mockResolvedValue(response([a]));
  await chooser.refresh();
  chooser.setLocked(true);
  await chooser.refresh();
  expect(select().disabled).toBe(true);
  expect(
    document.querySelector<HTMLButtonElement>("#refresh-cameras")!.disabled,
  ).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe("/api/cameras");
  chooser.setLocked(false);
  expect(select().disabled).toBe(false);
});
it("validates the explicitly selected manual index", () => {
  select().value = "manual";
  select().dispatchEvent(new Event("change"));
  const input = document.querySelector<HTMLInputElement>("#camera-index")!;
  input.value = "1.5";
  expect(() => chooser.selection()).toThrow(/whole native/);
  input.value = "2";
  expect(chooser.selection()).toEqual({ cameraIndex: 2 });
});
it("ignores a discovery result after disposal and shows loading feedback", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = chooser.refresh();
  expect(select().getAttribute("aria-busy")).toBe("true");
  expect(() => chooser.selection()).toThrow(/Finding cameras/);
  chooser.dispose();
  finish(response([a]));
  await pending;
  expect(select().value).toBe("");
});
it.each([null, [{ id: "manual", name: "Wrong ID" }], [a, a]])(
  "rejects invalid native metadata without adding selectable devices",
  async (cameras) => {
    fetchMock.mockResolvedValue(response(cameras));
    await chooser.refresh();
    expect(status()).toMatch(/invalid device list/);
    expect(select().value).toBe("");
  },
);
it("renders device names as text", async () => {
  fetchMock.mockResolvedValue(
    response([{ ...a, name: "<img src=x onerror=alert(1)>" }]),
  );
  await chooser.refresh();
  expect(document.querySelector("img")).toBeNull();
  expect(chooser.label).toBe("<img src=x onerror=alert(1)>");
});
