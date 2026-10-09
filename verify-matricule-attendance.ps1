$ErrorActionPreference = 'Continue'
$base = 'http://localhost:5000/api'
$script:bulkIds = @()

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body)
    $uri = "$base$Path"
    try {
        if ($null -ne $Body) {
            # -InputObject keeps arrays as JSON arrays (the pipe would enumerate them)
            $json = ConvertTo-Json -InputObject $Body -Depth 8 -Compress
            return Invoke-RestMethod -Uri $uri -Method $Method -ContentType 'application/json' -Body $json -TimeoutSec 40
        }
        return Invoke-RestMethod -Uri $uri -Method $Method -TimeoutSec 40
    } catch {
        $status = 0
        $detail = $_.Exception.Message
        try {
            $resp = $_.Exception.Response
            if ($resp) {
                $status = [int]$resp.StatusCode
                $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $detail = $reader.ReadToEnd()
            }
        } catch { }
        return [pscustomobject]@{ __error = $true; status = $status; body = $detail }
    }
}

Write-Output '=== 1. create temp class ==='
$class = Invoke-Api POST '/classes' @{
    className    = 'Beginers1'
    department   = 'General'
    cycle        = '1st Cycle'
    acedemicYear = '2026-2027'
    section      = 'D'
}
if ($class.__error) { Write-Output "CLASS FAILED $($class.status) $($class.body)"; exit 1 }
$classId = [string]$class.data._id
Write-Output "classId = $classId"

Write-Output '=== 2. create 3 students (auto matricule) ==='
$studentIds = @()
$script:matricules = @()
foreach ($n in 1..3) {
    $s = Invoke-Api POST '/students' @{
        fullName         = "ZZ Test Pupil $n"
        gender           = 'female'
        dob              = '2015-04-10'
        classId          = $classId
        department       = 'General'
        parentName       = 'ZZ Parent'
        parentPhone      = "+23760000000$n"
        address          = 'ZZ Address'
        registrationDate = '2026-01-15'
        feesPaid         = 0
        feesDue          = 0
    }
    if ($s.__error) { Write-Output "STUDENT $n FAILED $($s.status) $($s.body)"; continue }
    $studentIds += [string]$s.data._id
    $script:matricules += [string]$s.data.matricule
    Write-Output ("  {0,-16} matricule={1,-16} virtual={2,-16} year={3}" -f $s.data.fullName, $s.data.matricule, $s.data.admissionNumber, $s.data.enrollmentYear)
}
if ($studentIds.Count -ne 3) { Write-Output 'ABORT: students missing'; exit 1 }
$taken = $script:matricules[0]
$second = $script:matricules[1]
$suffix = ($second -split '-')[-1]

Write-Output '=== 3. student with an already-taken matricule (expect 409) ==='
$dup = Invoke-Api POST '/students' @{
    fullName         = 'ZZ Duplicate'
    matricule        = $taken
    gender           = 'male'
    dob              = '2015-01-01'
    classId          = $classId
    department       = 'General'
    parentName       = 'ZZ Parent'
    parentPhone      = '+237600000009'
    address          = 'ZZ Address'
    registrationDate = '2026-01-15'
    feesPaid         = 0
    feesDue          = 0
}
if ($dup.__error) { Write-Output "  rejected with $($dup.status) (good)" } else {
    Write-Output "  NOT REJECTED (problem!) -> created $($dup.data.matricule)"
    $script:bulkIds += [string]$dup.data._id
}

Write-Output '=== 4. search by matricule ==='
$found = Invoke-Api GET "/students/search/$suffix" $null
Write-Output "  searched '$suffix' -> matches: $($found.count) -> $((($found.data | ForEach-Object { $_.matricule }) -join ', '))"

Write-Output '=== 5. bulk attendance (2 present, 1 late) ==='
$today = (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
$records = @()
$statuses = @('present', 'present', 'late')
for ($i = 0; $i -lt 3; $i++) {
    $records += @{ studentId = $studentIds[$i]; classId = $classId; date = $today; status = $statuses[$i]; period = 'day'; recordedBy = 'verify-script' }
}
$save = Invoke-Api POST '/attendance/students/bulk' @{ records = $records }
if ($save.__error) { Write-Output "  SAVE FAILED $($save.status) $($save.body)" } else { Write-Output "  created=$($save.data.created) updated=$($save.data.updated)" }

Write-Output '=== 6. re-save the same day (expect updates, not duplicates) ==='
$records2 = @()
for ($i = 0; $i -lt 3; $i++) {
    $records2 += @{ studentId = $studentIds[$i]; classId = $classId; date = $today; status = 'absent'; period = 'day' }
}
$save2 = Invoke-Api POST '/attendance/students/bulk' @{ records = $records2 }
if ($save2.__error) { Write-Output "  SAVE2 FAILED $($save2.status) $($save2.body)" } else { Write-Output "  created=$($save2.data.created) updated=$($save2.data.updated)" }
$back = Invoke-Api POST '/attendance/students/bulk' @{ records = $records }
Write-Output "  restored: created=$($back.data.created) updated=$($back.data.updated)"


Write-Output '=== 7. register (day x class) ==='
$reg = Invoke-Api GET "/attendance/students/register?classId=$classId&date=$today" $null
Write-Output "  students=$($reg.count) days=$(($reg.data.days | Measure-Object).Count)"
$reg.data.students | ForEach-Object {
    $st = if ($_.records.Count) { $_.records[0].status } else { 'unmarked' }
    Write-Output ("    {0,-16} {1,-16} {2}" -f $_.matricule, $_.fullName, $st)
}

Write-Output '=== 8. list + summary + daily ==='
$list = Invoke-Api GET "/attendance/students?classId=$classId&date=$today" $null
Write-Output "  list records=$($list.count)"
$sum = Invoke-Api GET "/attendance/students/summary?classId=$classId" $null
$sum.data | ForEach-Object { Write-Output ("    {0} sessions={1} P{2} A{3} L{4} E{5} rate={6}%" -f $_.studentId, $_.sessions, $_.present, $_.absent, $_.late, $_.excused, $_.attendanceRate) }
$daily = Invoke-Api GET "/attendance/students/daily?classId=$classId" $null
$daily.data | ForEach-Object { Write-Output ("    day {0}: total={1} present={2} absent={3} late={4}" -f $_.dayKey, $_.total, $_.present, $_.absent, $_.late) }

Write-Output '=== 9. per-student summary ==='
$hist = Invoke-Api GET "/attendance/students/summary?studentId=$($studentIds[0])" $null
Write-Output "  sessions=$($hist.data[0].sessions) rate=$($hist.data[0].attendanceRate)%"

Write-Output '=== 10. backfill (dry run) + audit ==='
$bf = Invoke-Api POST '/students/backfill-matricules' @{ dryRun = $true }
Write-Output "  $($bf.message) -> assigned=$($bf.data.assigned)"
$au = Invoke-Api POST '/students/audit-matricules' @{ fix = $false }
Write-Output "  $($au.message) -> missing=$($au.data.missing.Count) duplicates=$($au.data.duplicates.Count)"

Write-Output '=== 11. PUT with a conflicting matricule (expect 409) ==='
$conf = Invoke-Api PUT "/students/$($studentIds[1])" @{ fullName = 'ZZ Test Pupil 2'; matricule = $taken }
if ($conf.__error) { Write-Output "  rejected with $($conf.status)" } else { Write-Output '  NOT REJECTED (problem!)' }

Write-Output '=== 12. PUT with an empty matricule (must keep the old one) ==='
$keep = Invoke-Api PUT "/students/$($studentIds[1])" @{ fullName = 'ZZ Test Pupil 2'; matricule = '   ' }
Write-Output "  kept matricule = $($keep.data.matricule)"

Write-Output '=== 13. bulk students (insertMany path) ==='
$bulk = Invoke-Api POST '/students/bulk' @(
    @{ fullName = 'ZZ Bulk Pupil A'; gender = 'male'; dob = '2015-05-01'; classId = $classId; department = 'General'; parentName = 'ZZ'; parentPhone = '+237600000012'; address = 'ZZ'; registrationDate = '2026-02-02'; feesPaid = 0; feesDue = 0 },
    @{ fullName = 'ZZ Bulk Pupil B'; gender = 'female'; dob = '2015-05-02'; classId = $classId; department = 'General'; parentName = 'ZZ'; parentPhone = '+237600000013'; address = 'ZZ'; registrationDate = '2026-02-02'; feesPaid = 0; feesDue = 0 }
)
if ($bulk.__error) { Write-Output "  BULK FAILED $($bulk.status) $($bulk.body)" } else {
    $bulk.data | ForEach-Object {
        Write-Output ("  {0,-18} {1,-16} year={2}" -f $_.fullName, $_.matricule, $_.enrollmentYear)
        $script:bulkIds += [string]$_._id
    }
}

Write-Output '=== 14. by-matricule lookup ==='
$look = Invoke-Api GET "/students/by-matricule/$second" $null
Write-Output "  $($look.data.fullName) -> $($look.data.matricule)"

Write-Output '=== 15. info after everything ==='
$info = Invoke-Api GET '/students/matricule-info' $null
Write-Output "  prefix=$($info.data.prefix) next=$($info.data.nextMatricule) with=$($info.data.studentsWithMatricule) without=$($info.data.studentsWithoutMatricule)"

Write-Output '=== 16. CLEANUP ==='
$allIds = @($studentIds) + @($script:bulkIds)
foreach ($id in $allIds) {
    $r = Invoke-Api DELETE "/students/$id" $null
    Write-Output "  deleted student $id -> $($r.success)"
}
$clear = Invoke-Api DELETE "/attendance/students/register?classId=$classId&date=$today" $null
Write-Output "  cleared register -> $($clear.message)"
$del = Invoke-Api DELETE "/classes/$classId" $null
Write-Output "  deleted class -> $($del.success)"
$left = Invoke-Api GET '/students/matricule-info' $null
Write-Output "  remaining students: with=$($left.data.studentsWithMatricule) without=$($left.data.studentsWithoutMatricule)"
$cnt = Invoke-Api GET "/attendance/students?classId=$classId" $null
Write-Output "  remaining attendance records: $($cnt.count)"
Write-Output 'DONE'

