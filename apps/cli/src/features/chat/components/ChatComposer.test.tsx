import { afterEach, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { ChatComposer } from "./ChatComposer";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

afterEach(() => {
  act(() => testSetup?.renderer.destroy());
  testSetup = undefined;
});

test("提交时去除首尾空白，空内容不提交", async () => {
  const submitted: string[] = [];
  testSetup = await testRender(
    <ChatComposer focused waiting={false} onSubmit={(text) => submitted.push(text)} />,
    { width: 80, height: 12, kittyKeyboard: true },
  );

  act(() => testSetup?.mockInput.pressEnter());
  await testSetup.flush();
  expect(submitted).toEqual([]);

  await act(async () => {
    await testSetup?.mockInput.typeText("  你好  ");
    testSetup?.mockInput.pressEnter();
  });
  await testSetup.flush();
  expect(submitted).toEqual(["你好"]);
});

test("等待模型回复时忽略提交", async () => {
  const submitted: string[] = [];
  testSetup = await testRender(
    <ChatComposer focused waiting onSubmit={(text) => submitted.push(text)} />,
    { width: 80, height: 12, kittyKeyboard: true },
  );

  await act(async () => {
    await testSetup?.mockInput.typeText("下一条");
    testSetup?.mockInput.pressEnter();
  });
  await testSetup.flush();
  expect(submitted).toEqual([]);
});
