// Commands enter their Job Object atomically at CreateProcess, before any user code runs.
// Closing the helper or losing its supervisor terminates all job members.
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <string>
#include <vector>
#include <iostream>
#include <cstdio>

static int fail(const char* operation) {
  std::cerr << operation << " failed: " << GetLastError() << std::endl;
  return 125;
}
static std::wstring quote(const std::wstring& value) {
  std::wstring out = L"\""; unsigned slashes = 0;
  for (wchar_t c : value) {
    if (c == L'\\') { ++slashes; continue; }
    if (c == L'"') out.append(slashes * 2 + 1, L'\\'); else out.append(slashes, L'\\');
    slashes = 0; out += c;
  }
  out.append(slashes * 2, L'\\'); return out + L"\"";
}
int wmain(int argc, wchar_t** argv) {
  if (argc == 3 && std::wstring(argv[1]) == L"--stop") {
    std::wstring name = L"Local\\DevenvJob-" + std::wstring(argv[2]);
    HANDLE owned = OpenJobObjectW(JOB_OBJECT_TERMINATE | JOB_OBJECT_QUERY, FALSE, name.c_str());
    if (!owned) return GetLastError() == ERROR_FILE_NOT_FOUND ? 0 : fail("Open owned job");
    if (!TerminateJobObject(owned, 1)) return fail("Terminate owned job");
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
    for (;;) {
      if (!QueryInformationJobObject(owned, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr)) return fail("Query owned job");
      if (!accounting.ActiveProcesses) break;
      Sleep(10);
    }
    CloseHandle(owned); return 0;
  }
  if (argc < 4) return 125;
  const bool background = std::wstring(argv[2]) == L"--background";
  const int commandIndex = background ? 4 : 2;
  if (argc <= commandIndex) return 125;
  DWORD parentPid = wcstoul(argv[1], nullptr, 10);
  HANDLE parent = OpenProcess(SYNCHRONIZE, FALSE, parentPid);
  if (!parent) return fail("Open supervisor");
  std::wstring jobName = L"Local\\DevenvJob-" + std::to_wstring(GetCurrentProcessId());
  HANDLE job = CreateJobObjectW(nullptr, jobName.c_str());
  if (!job) return fail("Create job");
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) return fail("Set job limits");
  SIZE_T size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &size);
  std::vector<BYTE> storage(size);
  STARTUPINFOEXW startup{}; startup.StartupInfo.cb = sizeof(startup);
  startup.lpAttributeList = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
  if (!InitializeProcThreadAttributeList(startup.lpAttributeList, 1, 0, &size)) return fail("Initialize attributes");
  if (!UpdateProcThreadAttribute(startup.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &job, sizeof(job), nullptr, nullptr)) return fail("Assign job attribute");
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.StartupInfo.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.StartupInfo.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  std::wstring command;
  for (int i = commandIndex; i < argc; ++i) { if (i > commandIndex) command += L" "; command += quote(argv[i]); }
  PROCESS_INFORMATION child{};
  BOOL created = CreateProcessW(argv[commandIndex], command.data(), nullptr, nullptr, TRUE, EXTENDED_STARTUPINFO_PRESENT, nullptr, nullptr, &startup.StartupInfo, &child);
  DeleteProcThreadAttributeList(startup.lpAttributeList);
  if (!created) return fail("Create command");
  CloseHandle(child.hThread);
  HANDLE handles[] = { child.hProcess, parent };
  DWORD wait = WaitForMultipleObjects(2, handles, FALSE, INFINITE);
  DWORD code = 1;
  if (wait == WAIT_OBJECT_0) GetExitCodeProcess(child.hProcess, &code);
  if (background && wait == WAIT_OBJECT_0) {
    // The supervisor observes the launcher result while this helper retains the Job.
    // Explicit cleanup runs before --stop terminates the remaining members.
    FILE* status = nullptr;
    if (_wfopen_s(&status, argv[3], L"w") != 0 || !status) { TerminateJobObject(job, 125); return fail("Write launcher status"); }
    fprintf(status, "exit=%lu\n", code); fclose(status);
    JOBOBJECT_BASIC_ACCOUNTING_INFORMATION remaining{};
    while (WaitForSingleObject(parent, 50) == WAIT_TIMEOUT) {
      if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &remaining, sizeof(remaining), nullptr) || !remaining.ActiveProcesses) break;
    }
  }
  // Even a successful early parent exit cannot orphan descendants.
  TerminateJobObject(job, code);
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  while (QueryInformationJobObject(job, JobObjectBasicAccountingInformation, &accounting, sizeof(accounting), nullptr) && accounting.ActiveProcesses) Sleep(10);
  CloseHandle(child.hProcess); CloseHandle(job); CloseHandle(parent);
  return static_cast<int>(code);
}
