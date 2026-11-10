// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  CameraChoice,
  cameraChoiceMarkup,
  cameraChoiceMarkupFor,
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
it("keeps the default IDs and binds two prefixed selectors to independent labels and status messages", () => {
  expect(cameraChoiceMarkupFor()).toBe(cameraChoiceMarkup);
  document.body.innerHTML =
    cameraChoiceMarkup +
    cameraChoiceMarkupFor("reference") +
    cameraChoiceMarkupFor("support");
  const ids = [...document.querySelectorAll("[id]")].map(
    (element) => element.id,
  );
  expect(new Set(ids).size).toBe(ids.length);
  expect(document.querySelector("#camera-choice")).not.toBeNull();
  for (const prefix of ["reference", "support"]) {
    const control = document.querySelector<HTMLSelectElement>(
      `#${prefix}-camera-choice`,
    )!;
    expect(
      document.querySelector(`label[for="${control.id}"]`)?.textContent,
    ).toBe("Choose camera");
    expect(control.getAttribute("aria-describedby")).toBe(
      `${prefix}-camera-choice-status`,
    );
    expect(
      document.getElementById(control.getAttribute("aria-describedby")!),
    ).not.toBeNull();
    expect(
      document.querySelector(`label[for="${prefix}-camera-index"]`),
    ).not.toBeNull();
  }
  expect(() => cameraChoiceMarkupFor('bad" id')).toThrow(/prefix/);
});
it("refreshes, locks, reorders and disconnects two independent native camera roles", async () => {
  document.body.innerHTML =
    cameraChoiceMarkupFor("reference") + cameraChoiceMarkupFor("support");
  const reference = new CameraChoice(document, "reference");
  const support = new CameraChoice(document, "support");
  const refSelect = document.querySelector<HTMLSelectElement>(
    "#reference-camera-choice",
  )!;
  const supportSelect = document.querySelector<HTMLSelectElement>(
    "#support-camera-choice",
  )!;
  try {
    fetchMock.mockResolvedValue(response([a, b]));
    await reference.refresh();
    await support.refresh();
    refSelect.value = a.id;
    refSelect.dispatchEvent(new Event("change"));
    supportSelect.value = b.id;
    supportSelect.dispatchEvent(new Event("change"));
    reference.setLocked(true);
    expect(refSelect.disabled).toBe(true);
    expect(supportSelect.disabled).toBe(false);
    fetchMock.mockResolvedValue(response([b, a]));
    await support.refresh();
    expect(support.currentSelection()).toEqual({ cameraId: b.id });
    expect(reference.currentSelection()).toEqual({ cameraId: a.id });
    fetchMock.mockResolvedValue(response([a]));
    await support.refresh();
    expect(support.currentSelection()).toBeNull();
    expect(
      document.querySelector("#support-camera-choice-status")?.textContent,
    ).toMatch(/disconnected/);
    expect(reference.currentSelection()).toEqual({ cameraId: a.id });
    expect(fetchMock.mock.calls.every(([url]) => url === "/api/cameras")).toBe(
      true,
    );
  } finally {
    reference.dispose();
    support.dispose();
  }
});
it("publishes local selection and discovery changes without focusing or announcing validation errors", async () => {
  const change = vi.fn();
  const unsubscribe = chooser.onChange(change);
  const initialStatus = status();
  expect(chooser.currentSelection()).toBeNull();
  expect(status()).toBe(initialStatus);
  fetchMock.mockResolvedValue(response([a]));
  await chooser.refresh();
  expect(change).toHaveBeenCalledTimes(2);
  expect(chooser.currentSelection()).toEqual({ cameraId: a.id });
  select().value = "manual";
  select().dispatchEvent(new Event("change"));
  const index = document.querySelector<HTMLInputElement>("#camera-index")!;
  index.value = "3";
  index.dispatchEvent(new Event("input"));
  expect(chooser.currentSelection()).toEqual({ cameraIndex: 3 });
  index.value = "1.5";
  index.dispatchEvent(new Event("input"));
  chooser.setLocked(true);
  expect(chooser.currentSelection()).toBeNull();
  expect(change).toHaveBeenCalledTimes(5);
  unsubscribe();
  index.dispatchEvent(new Event("input"));
  expect(change).toHaveBeenCalledTimes(5);
  chooser.dispose();
  expect(chooser.currentSelection()).toBeNull();
});
