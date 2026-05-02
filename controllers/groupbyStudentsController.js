import GroupbyStudents from "../models/groupbyStudentsModel.js";
import Student from "../models/studentModel.js";
import RubricsSubjectModel from "../models/RubricsSubjectModel.js";
import User from "../models/userModel.js";

export const createGroup = async (req, res) => {
  try {
    console.log("Received group creation request:", req.body);
    console.log("User from token:", req.user);

    const { groupName, groupType, groupSize, members, subjectId } = req.body;

    const missingFields = [];
    if (!groupName) missingFields.push("groupName");
    if (!groupType) missingFields.push("groupType");
    if (!groupSize) missingFields.push("groupSize");
    if (!members || !Array.isArray(members)) missingFields.push("members");

    if (missingFields.length > 0) {
      console.log("Missing required fields:", missingFields);
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        error: "Members array is required and cannot be empty",
      });
    }

    if (members.length !== groupSize) {
      return res.status(400).json({
        error: "Group size must match the number of members",
      });
    }

    const studentIds = members.map((member) => member.studentId);
    console.log("Checking student IDs:", studentIds);

    const existingStudents = await Student.find({
      _id: { $in: studentIds },
      status: "active",
    });

    console.log(
      "Found existing students:",
      existingStudents.length,
      "out of",
      studentIds.length,
    );

    if (existingStudents.length !== studentIds.length) {
      const foundIds = existingStudents.map((s) => s._id.toString());
      const missingIds = studentIds.filter(
        (id) => !foundIds.includes(id.toString()),
      );
      console.log("Missing student IDs:", missingIds);

      return res.status(400).json({
        error: `One or more students not found or inactive. Missing: ${missingIds.join(", ")}`,
      });
    }

    if (subjectId) {
      const subject = await RubricsSubjectModel.findById(subjectId);
      if (!subject) {
        console.log("Subject not found:", subjectId);
        return res.status(400).json({
          error: "Subject not found",
        });
      }
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      console.log("User not found:", req.user.userId);
      return res.status(400).json({
        error: "User not found",
      });
    }

    const newGroup = new GroupbyStudents({
      groupName,
      groupType,
      groupSize,
      members,
      subjectId,
      createdBy: req.user.userId,
    });

    console.log("Attempting to save group:", newGroup);
    const savedGroup = await newGroup.save();
    console.log("Group saved successfully:", savedGroup);

    res.status(201).json({
      message: "Group created successfully",
      group: savedGroup,
    });
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({
      error: "Failed to create group",
    });
  }
};

export const getGroupsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;

    const groups = await GroupbyStudents.find({
      subjectId,
      status: "active",
    }).populate("members.studentId", "studentDetails academicDetails");

    res.status(200).json({
      groups,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({
      error: "Failed to fetch groups",
    });
  }
};

export const getAllGroups = async (req, res) => {
  try {
    const groups = await GroupbyStudents.find({
      status: "active",
    })
      .populate("members.studentId", "studentDetails academicDetails")
      .populate("subjectId", "subjectName subjectCode");

    res.status(200).json({
      groups,
    });
  } catch (error) {
    console.error("Error fetching all groups:", error);
    res.status(500).json({
      error: "Failed to fetch groups",
    });
  }
};

export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const updateData = req.body;

    const group = await GroupbyStudents.findById(groupId);
    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    if (updateData.members) {
      const studentIds = updateData.members.map((member) => member.studentId);
      const existingStudents = await Student.find({
        _id: { $in: studentIds },
        status: "active",
      });

      if (existingStudents.length !== studentIds.length) {
        return res.status(400).json({
          error: "One or more students not found or inactive",
        });
      }
    }

    const updatedGroup = await GroupbyStudents.findByIdAndUpdate(
      groupId,
      updateData,
      { new: true },
    ).populate("members.studentId", "studentDetails academicDetails");

    res.status(200).json({
      message: "Group updated successfully",
      group: updatedGroup,
    });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({
      error: "Failed to update group",
    });
  }
};

export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await GroupbyStudents.findById(groupId);
    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    group.status = "inactive";
    await group.save();

    res.status(200).json({
      message: "Group deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({
      error: "Failed to delete group",
    });
  }
};

export const getStudentsForRandomSelection = async (req, res) => {
  try {
    const students = await Student.find({
      status: "active",
    }).select("studentDetails academicDetails");

    const formattedStudents = students.map((student) => ({
      _id: student._id,
      rollNumber: student.academicDetails?.rollNumber || "",
      studentName:
        `${student.studentDetails?.firstName || ""} ${student.studentDetails?.lastName || ""}`.trim(),
    }));

    res.status(200).json({
      students: formattedStudents,
    });
  } catch (error) {
    console.error("Error fetching students for random selection:", error);
    res.status(500).json({
      error: "Failed to fetch students",
    });
  }
};
