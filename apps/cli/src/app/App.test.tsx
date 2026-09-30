import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { App } from "./App";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
});

test("首页提交提示词后进入聊天页，输入 q 不触发退出", async () => {
  let quitCount = 0;
  testSetup = await testRender(<App onQuit={() => quitCount++} />, {
    width: 120,
    height: 40,
    kittyKeyboard: true,
  });

  await act(async () => {
    await testSetup?.mockInput.typeText("quick chat");
  });
  expect(quitCount).toBe(0);

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(testSetup.captureCharFrame()).toContain("quick chat");
});
