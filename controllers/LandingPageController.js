import landingModel from "../models/landingPageModel.js";
import linkModel from "../models/linkModel.js";

export const captureLeadFromLandingPage = async (req, res) => {
  const { stuName, stuPhone, stuEmail, compExam, compScore, uniqueId } =
    req.body;
  const payload = {
    stuName,
    stuPhone,
    stuEmail,
    compExam,
    compScore,
    uniqueId,
  };
  const response = await landingModel.create(payload);
  if (response) {
    res.status(201).json({ message: "Lead Captured" });
  } else {
    res.status(500).json({ message: "Something went wrong, try again." });
  }
};

export const getAllLandingPageLeads = async (req, res) => {
  try {
    const leads = await landingModel.find();

    if (leads && leads.length > 0) {
      const uniqueIds = leads.map((lead) => lead.uniqueId);

      const links = await linkModel.find({ uniqueId: { $in: uniqueIds } });

      const linkMap = links.reduce((acc, link) => {
        acc[link.uniqueId] = link;
        return acc;
      }, {});

      const leadsWithLinks = leads.map((lead) => {
        return {
          ...lead._doc,
          link: linkMap[lead.uniqueId] || null,
        };
      });

      res.status(200).json({ message: "Leads Lists", leads: leadsWithLinks });
    } else {
      res.status(200).json({ message: "Leads Lists", leads: [] });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Something went wrong.", error: error.message });
  }
};
