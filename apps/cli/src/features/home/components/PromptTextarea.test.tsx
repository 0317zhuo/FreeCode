import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { PromptTextarea } from "./PromptTextarea";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
});

test("只有非空提示词的 Enter 会提交，Shift+Enter 插入换行", async () => {
  const submitted: string[] = [];
  testSetup = await testRender(<PromptTextarea onSubmit={(prompt) => submitted.push(prompt)} />, {
    width: 80,
    height: 24,
    kittyKeyboard: true,
  });

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(submitted).toEqual([]);

  await act(async () => {
    await testSetup?.mockInput.typeText("第一行");
    testSetup?.mockInput.pressEnter({ shift: true });
    await testSetup?.mockInput.typeText("第二行");
  });
  await testSetup.flush();
  expect(submitted).toEqual([]);

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(submitted).toEqual(["第一行\n第二行"]);
});

test("带修饰键的 Enter 不会提交", async () => {
  const submitted: string[] = [];
  testSetup = await testRender(<PromptTextarea onSubmit={(prompt) => submitted.push(prompt)} />, {
    width: 80,
    height: 24,
    kittyKeyboard: true,
  });

  await act(async () => {
    await testSetup?.mockInput.typeText("hello");
    for (let mask = 1; mask < 16; mask++) {
      testSetup?.mockInput.pressEnter({
        shift: Boolean(mask & 1),
        ctrl: Boolean(mask & 2),
        meta: Boolean(mask & 4),
        super: Boolean(mask & 8),
      });
    }
  });
  await testSetup.flush();
  expect(submitted).toEqual([]);

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(submitted).toHaveLength(1);
});
